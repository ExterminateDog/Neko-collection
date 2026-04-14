
import base64
import binascii
import hashlib
import io
import json
import os
import secrets
import sqlite3
import sys
import threading
import time
import zipfile
from datetime import date, datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

HOST = os.environ.get("NEKO_HOST", "127.0.0.1")
PORT = int(os.environ.get("NEKO_PORT", "8765"))
SCRIPT_DIR = Path(__file__).resolve().parent
DB_PATH = SCRIPT_DIR / "neko_collection.db"
FRONTEND_DIR = SCRIPT_DIR.parent / "frontend"
UPLOADS_DIR = FRONTEND_DIR / "uploads"
UPLOADS_URL_PREFIX = "/uploads/"
BACKUPS_DIR = SCRIPT_DIR / "backups"

DEFAULT_ADMIN_USERNAME = os.environ.get("NEKO_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.environ.get("NEKO_ADMIN_PASSWORD", "neko12345")
PASSWORD_SALT = os.environ.get("NEKO_PASSWORD_SALT", "neko-collection-salt")
SESSION_TTL_DAYS = int(os.environ.get("NEKO_SESSION_TTL_DAYS", "7"))
MAX_IMAGE_DATA_LENGTH = int(os.environ.get("NEKO_MAX_IMAGE_DATA_LENGTH", "5000000"))
AUTO_BACKUP_ENABLED = os.environ.get("NEKO_AUTO_BACKUP_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}
AUTO_BACKUP_TIME = os.environ.get("NEKO_AUTO_BACKUP_TIME", "03:00").strip() or "03:00"
MAX_LOCAL_BACKUPS = max(1, int(os.environ.get("NEKO_MAX_LOCAL_BACKUPS", "3")))
AUTO_BACKUP_POLL_SECONDS = max(60, int(os.environ.get("NEKO_AUTO_BACKUP_POLL_SECONDS", "300")))

DEFAULT_RATES = {"CNY": 1.0, "JPY": 0.048, "TWD": 0.225, "HKD": 0.92}
ALLOWED_CURRENCIES = set(DEFAULT_RATES.keys())
BOOK_EDITIONS = {"首刷限定版", "首刷版", "特装版", "普通版"}
ALLOWED_STATUSES = {"owned", "preorder", "wishlist"}
IMAGE_EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
}
BACKUP_VERSION = 1
BACKUP_FILE_PREFIX = "neko-backup-"
backup_lock = threading.Lock()


def recreate_collections_with_new_status_constraint(conn: sqlite3.Connection) -> None:
    cols = [
        "id", "name", "category", "series_name", "status", "platform",
        "purchase_price", "purchase_currency", "purchase_price_cny",
        "purchase_fx_rate_to_cny", "purchase_fx_rate_timestamp",
        "list_price_amount", "list_price_currency", "list_price_cny",
        "list_fx_rate_to_cny", "list_fx_rate_timestamp",
        "book_edition_type", "purchase_date", "tags", "notes", "image_data",
        "book_volumes_json", "sort_order", "created_at", "updated_at",
        "author", "publisher", "is_series"
    ]
    conn.execute("ALTER TABLE collections RENAME TO collections_old")
    old_cols = {row["name"] for row in conn.execute("PRAGMA table_info(collections_old)").fetchall()}
    conn.execute(
        """
        CREATE TABLE collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            series_name TEXT,
            status TEXT NOT NULL CHECK (status IN ('owned', 'preorder', 'wishlist')),
            platform TEXT,
            purchase_price REAL,
            purchase_currency TEXT NOT NULL DEFAULT 'CNY',
            purchase_price_cny REAL,
            purchase_fx_rate_to_cny REAL,
            purchase_fx_rate_timestamp TEXT,
            list_price_amount REAL,
            list_price_currency TEXT NOT NULL DEFAULT 'CNY',
            list_price_cny REAL,
            list_fx_rate_to_cny REAL,
            list_fx_rate_timestamp TEXT,
            book_edition_type TEXT,
            purchase_date TEXT,
            tags TEXT,
            notes TEXT,
            image_data TEXT,
            book_volumes_json TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            author TEXT,
            publisher TEXT,
            is_series INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    common_cols = [c for c in cols if c in old_cols]
    if common_cols:
        cols_sql = ", ".join(common_cols)
        conn.execute(f"INSERT INTO collections ({cols_sql}) SELECT {cols_sql} FROM collections_old")
    conn.execute("DROP TABLE collections_old")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().date().isoformat()


def hash_password(password: str) -> str:
    return hashlib.sha256(f"{PASSWORD_SALT}:{password}".encode("utf-8")).hexdigest()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_startup_options(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    options = {"admin_password": None}
    i = 0
    while i < len(args):
        arg = str(args[i]).strip()
        if arg in {"-pw", "--password"}:
            if i + 1 >= len(args):
                raise ValueError("-pw ?????????")
            options["admin_password"] = args[i + 1]
            i += 2
            continue
        if arg in {"-h", "--help"}:
            print("Usage: python backend/server.py [-pw <initial_password>]")
            print("Note: -pw only applies when the admin user is created for the first time.")
            raise SystemExit(0)
        raise ValueError(f"??????: {arg}")
    return options


def ensure_column(conn: sqlite3.Connection, table: str, definition: str) -> None:
    name = definition.split()[0]
    cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if name not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def init_db(admin_password=None) -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS exchange_rates (
                currency TEXT PRIMARY KEY,
                rate_to_cny REAL NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                series_name TEXT,
                status TEXT NOT NULL CHECK (status IN ('owned', 'preorder', 'wishlist')),
                platform TEXT,
                purchase_price REAL,
                purchase_currency TEXT NOT NULL DEFAULT 'CNY',
                purchase_price_cny REAL,
                purchase_fx_rate_to_cny REAL,
                purchase_fx_rate_timestamp TEXT,
                list_price_amount REAL,
                list_price_currency TEXT NOT NULL DEFAULT 'CNY',
                list_price_cny REAL,
                list_fx_rate_to_cny REAL,
                list_fx_rate_timestamp TEXT,
                book_edition_type TEXT,
                purchase_date TEXT,
                tags TEXT,
                notes TEXT,
                image_data TEXT,
                book_volumes_json TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                author TEXT,
                publisher TEXT,
                is_series INTEGER NOT NULL DEFAULT 1
            )
            """
        )

        collections_sql_row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='collections'"
        ).fetchone()
        collections_sql = (collections_sql_row["sql"] or "") if collections_sql_row else ""
        if "status IN ('owned', 'wishlist')" in collections_sql and "preorder" not in collections_sql:
            recreate_collections_with_new_status_constraint(conn)

        for col in [
            "series_name TEXT", "purchase_fx_rate_to_cny REAL",
            "purchase_fx_rate_timestamp TEXT", "list_fx_rate_to_cny REAL",
            "list_fx_rate_timestamp TEXT", "book_edition_type TEXT",
            "image_data TEXT", "book_volumes_json TEXT",
            "sort_order INTEGER NOT NULL DEFAULT 0", "author TEXT", "publisher TEXT",
            "is_series INTEGER NOT NULL DEFAULT 1",
            "is_private INTEGER NOT NULL DEFAULT 0",
            "manufacturer TEXT"
        ]:
            ensure_column(conn, "collections", col)

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT
            )
            """
        )
        ensure_column(conn, "users", "updated_at TEXT")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )

        ts = now_iso()
        for currency, rate in DEFAULT_RATES.items():
            conn.execute(
                "INSERT INTO exchange_rates(currency, rate_to_cny, updated_at) VALUES (?, ?, ?) ON CONFLICT(currency) DO NOTHING",
                (currency, rate, ts),
            )

        initial_admin_password = str(admin_password or DEFAULT_ADMIN_PASSWORD)
        if not conn.execute("SELECT id FROM users LIMIT 1").fetchone():
            conn.execute(
                "INSERT INTO users(username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (DEFAULT_ADMIN_USERNAME, hash_password(initial_admin_password), ts, ts),
            )
        migrate_inline_images(conn)
        compact_stored_dates(conn)


def image_extension_for_mime(content_type: str) -> str:
    return IMAGE_EXTENSION_MAP.get(str(content_type or "").lower().strip(), ".bin")


def save_image_bytes(data: bytes, content_type: str) -> str:
    if len(data) > MAX_IMAGE_DATA_LENGTH:
        raise ValueError("鍥剧墖杩囧ぇ锛岃鍘嬬缉鍚庡啀涓婁紶")
    ext = image_extension_for_mime(content_type)
    if ext == ".bin":
        raise ValueError("鍥剧墖鏍煎紡涓嶆敮鎸?")
    digest = hashlib.sha256(data).hexdigest()
    filename = f"{digest}{ext}"
    target = UPLOADS_DIR / filename
    if not target.exists():
        target.write_bytes(data)
    return f"{UPLOADS_URL_PREFIX}{filename}"


def persist_data_url_image(image_data: str) -> str:
    text = str(image_data or "").strip()
    if len(text) > MAX_IMAGE_DATA_LENGTH:
        raise ValueError("鍥剧墖杩囧ぇ锛岃鍘嬬缉鍚庡啀涓婁紶")
    if not text.startswith("data:image/"):
        raise ValueError("鍥剧墖鏍煎紡涓嶆敮鎸?")
    try:
        header, encoded = text.split(",", 1)
    except ValueError as exc:
        raise ValueError("鍥剧墖鏍煎紡涓嶆敮鎸?") from exc
    if ";base64" not in header:
        raise ValueError("鍥剧墖鏍煎紡涓嶆敮鎸?")
    content_type = header[5:].split(";", 1)[0].strip().lower()
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ValueError("鍥剧墖鏍煎紡涓嶆敮鎸?") from exc
    return save_image_bytes(data, content_type)


def is_uploaded_image_path(value) -> bool:
    text = str(value or "").strip()
    if not text.startswith(UPLOADS_URL_PREFIX):
        return False
    filename = text[len(UPLOADS_URL_PREFIX):]
    return bool(filename) and "/" not in filename and "\\" not in filename


def migrate_inline_images(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT id, image_data, book_volumes_json FROM collections").fetchall()
    for row in rows:
        changed = False
        image_data = row["image_data"]
        if image_data and str(image_data).startswith("data:image/"):
            image_data = persist_data_url_image(image_data)
            changed = True

        volumes_text = row["book_volumes_json"] or ""
        try:
            volumes = json.loads(volumes_text) if volumes_text else []
        except json.JSONDecodeError:
            volumes = []
        migrated_volumes = []
        for volume in volumes:
            if isinstance(volume, dict) and volume.get("cover_image_data") and str(volume.get("cover_image_data")).startswith("data:image/"):
                volume = dict(volume)
                volume["cover_image_data"] = persist_data_url_image(volume.get("cover_image_data"))
                changed = True
            migrated_volumes.append(volume)

        if changed:
            conn.execute(
                "UPDATE collections SET image_data=?, book_volumes_json=? WHERE id=?",
                (
                    image_data,
                    json.dumps(migrated_volumes, ensure_ascii=False) if migrated_volumes else None,
                    row["id"],
                ),
            )


def compact_date_text(value):
    text = str(value or "").strip()
    if not text:
        return None
    return text[:10]


def compact_stored_dates(conn: sqlite3.Connection) -> None:
    for table, columns in {
        "collections": [
            "purchase_date",
            "created_at",
            "updated_at",
            "purchase_fx_rate_timestamp",
            "list_fx_rate_timestamp",
        ],
        "exchange_rates": ["updated_at"],
        "users": ["created_at", "updated_at"],
        "sessions": ["created_at", "expires_at"],
    }.items():
        for column in columns:
            conn.execute(
                f"UPDATE {table} SET {column}=substr({column}, 1, 10) "
                f"WHERE {column} IS NOT NULL AND length({column}) > 10"
            )

    rows = conn.execute("SELECT id, book_volumes_json FROM collections WHERE book_volumes_json IS NOT NULL").fetchall()
    for row in rows:
        raw = row["book_volumes_json"]
        try:
            volumes = json.loads(raw) if raw else []
        except json.JSONDecodeError:
            continue

        changed = False
        normalized = []
        for volume in volumes:
            if not isinstance(volume, dict):
                normalized.append(volume)
                continue
            next_volume = dict(volume)
            for key in ("purchase_date", "purchase_fx_rate_timestamp", "list_fx_rate_timestamp"):
                compacted = compact_date_text(next_volume.get(key))
                if compacted != next_volume.get(key):
                    next_volume[key] = compacted
                    changed = True
            normalized.append(next_volume)

        if changed:
            conn.execute(
                "UPDATE collections SET book_volumes_json=? WHERE id=?",
                (json.dumps(normalized, ensure_ascii=False), row["id"]),
            )


def parse_float_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError("金额字段必须是数字")


def normalize_image_data(image_data, existing=None):
    if image_data is None:
        return existing
    text = str(image_data).strip()
    if not text:
        return None
    if len(text) > MAX_IMAGE_DATA_LENGTH:
        raise ValueError("图片过大，请压缩后再上传")
    if not text.startswith("data:image/"):
        raise ValueError("图片格式不支持")
    return text


def normalize_image_reference(image_data, existing=None):
    if image_data is None:
        return existing
    text = str(image_data).strip()
    if not text:
        return None
    if text.startswith("data:image/"):
        return persist_data_url_image(text)
    if is_uploaded_image_path(text):
        return text
    raise ValueError("鍥剧墖鏍煎紡涓嶆敮鎸?")


def get_rates_map(conn: sqlite3.Connection) -> dict:
    return {
        row["currency"]: {"rate": float(row["rate_to_cny"]), "updated_at": row["updated_at"]}
        for row in conn.execute("SELECT currency, rate_to_cny, updated_at FROM exchange_rates").fetchall()
    }


def convert_amount(amount, currency, rates_map):
    if amount is None:
        return None, None, None
    entry = rates_map.get(currency)
    if not entry:
        return None, None, None
    rate = float(entry["rate"])
    return round(amount * rate, 2), rate, compact_date_text(entry["updated_at"])


def normalize_book_volumes(payload_volumes, rates_map, existing_volumes):
    source = payload_volumes if payload_volumes is not None else existing_volumes
    if source is None: source = []
    if not isinstance(source, list): raise ValueError("book_volumes 必须是数组")

    out = []
    for idx, raw in enumerate(source):
        if not isinstance(raw, dict): continue
        title = str(raw.get("volume_title", "")).strip()
        if not title: continue
        purchase_status = str(raw.get("purchase_status", "wishlist")).strip()
        if purchase_status not in ALLOWED_STATUSES: purchase_status = "wishlist"
        pc = str(raw.get("purchase_currency", "CNY")).upper().strip() or "CNY"
        lc = str(raw.get("list_price_currency", "CNY")).upper().strip() or "CNY"
        if pc not in ALLOWED_CURRENCIES: raise ValueError("分册 purchase_currency 不支持")
        if lc not in ALLOWED_CURRENCIES: raise ValueError("分册 list_price_currency 不支持")
        pp = parse_float_or_none(raw.get("purchase_price"))
        if purchase_status == "wishlist":
            pp = 0.0
        lp = parse_float_or_none(raw.get("list_price_amount"))
        pp_cny, pp_rate, pp_ts = convert_amount(pp, pc, rates_map)
        lp_cny, lp_rate, lp_ts = convert_amount(lp, lc, rates_map)
        out.append({
            "volume_title": title,
            "edition_type": str(raw.get("edition_type", "")).strip() or None,
            "cover_image_data": normalize_image_reference(raw.get("cover_image_data"), raw.get("cover_image_data")),
            "platform": str(raw.get("platform", "")).strip() or None,
            "purchase_status": purchase_status,
            "purchase_price": pp,
            "purchase_currency": pc,
            "purchase_price_cny": pp_cny,
            "purchase_fx_rate_to_cny": pp_rate,
            "purchase_fx_rate_timestamp": pp_ts,
            "list_price_amount": lp,
            "list_price_currency": lc,
            "list_price_cny": lp_cny,
            "list_fx_rate_to_cny": lp_rate,
            "list_fx_rate_timestamp": lp_ts,
            "purchase_date": compact_date_text(raw.get("purchase_date")),
            "notes": str(raw.get("notes", "")).strip() or None,
            "sort_order": idx,
        })
    return out


def normalize_item_payload(payload: dict, rates_map: dict, existing_item=None) -> dict:
    existing_item = existing_item or {}
    name = str(payload.get("name", "")).strip()
    category = str(payload.get("category", "")).strip()
    status = str(payload.get("status", "")).strip()
    if not name: raise ValueError("name 为必填")
    if not category: raise ValueError("category 为必填")
    if status not in ALLOWED_STATUSES: raise ValueError("status 只能是 owned、preorder 或 wishlist")
    purchase_currency = str(payload.get("purchase_currency", "CNY")).upper().strip() or "CNY"
    list_price_currency = str(payload.get("list_price_currency", "CNY")).upper().strip() or "CNY"
    if purchase_currency not in ALLOWED_CURRENCIES: raise ValueError("purchase_currency 不支持")
    if list_price_currency not in ALLOWED_CURRENCIES: raise ValueError("list_price_currency 不支持")
    purchase_price = parse_float_or_none(payload.get("purchase_price"))
    if status == "wishlist":
        purchase_price = 0.0
    list_price_amount = parse_float_or_none(payload.get("list_price_amount"))
    purchase_price_cny, purchase_rate, purchase_ts = convert_amount(purchase_price, purchase_currency, rates_map)
    list_price_cny, list_rate, list_ts = convert_amount(list_price_amount, list_price_currency, rates_map)
    tags = payload.get("tags", [])
    tags_text = ",".join(str(t).strip() for t in tags if str(t).strip()) if isinstance(tags, list) else str(tags or "").strip()
    book_edition_type = payload.get("book_edition_type")
    if category == "书籍" and book_edition_type and book_edition_type not in BOOK_EDITIONS:
        raise ValueError("book_edition_type 不在可选范围")
    if category != "书籍": book_edition_type = None
    series_name = None
    book_volumes_json = None
    is_series = 1
    if category == "书籍":
        is_series = 1 if payload.get("is_series") in [True, 1, "1", "true"] else 0
        series_name = str(payload.get("series_name", name)).strip() or name

        vols = normalize_book_volumes(payload.get("book_volumes", None), rates_map, existing_item.get("book_volumes", []))
        book_volumes_json = json.dumps(vols, ensure_ascii=False)
    sort_order = int(payload.get("sort_order", existing_item.get("sort_order", 0)))
    is_private = 1 if payload.get("is_private") in [True, 1, "1", "true"] else 0
    manufacturer = str(payload.get("manufacturer", "")).strip() or None
    return {
        "name": name, "category": category, "series_name": series_name, "status": status,
        "platform": str(payload.get("platform", "")).strip() or None,
        "purchase_price": purchase_price, "purchase_currency": purchase_currency,
        "purchase_price_cny": purchase_price_cny, "purchase_fx_rate_to_cny": purchase_rate,
        "purchase_fx_rate_timestamp": purchase_ts, "list_price_amount": list_price_amount,
        "list_price_currency": list_price_currency, "list_price_cny": list_price_cny,
        "list_fx_rate_to_cny": list_rate, "list_fx_rate_timestamp": list_ts,
        "book_edition_type": book_edition_type, "purchase_date": compact_date_text(payload.get("purchase_date")),
        "tags": tags_text, "notes": str(payload.get("notes", "")).strip() or None,
        "image_data": normalize_image_reference(payload.get("image_data", None), existing_item.get("image_data")),
        "book_volumes_json": book_volumes_json, "sort_order": sort_order,
        "author": str(payload.get("author", "")).strip() or None,
        "publisher": str(payload.get("publisher", "")).strip() or None,
        "is_series": is_series, "is_private": is_private,
        "manufacturer": manufacturer,
    }


def row_to_item(row: sqlite3.Row) -> dict:
    tags = [part.strip() for part in (row["tags"] or "").split(",") if part.strip()]
    text = row["book_volumes_json"]
    vols = json.loads(text) if text else []
    
    status = row["status"]
    if row["category"] == "书籍" and row["is_series"] and vols:
        vol_statuses = {v.get("purchase_status") for v in vols}
        if "wishlist" in vol_statuses:
            status = "wishlist"
        elif "preorder" in vol_statuses:
            status = "preorder"
        else:
            status = "owned"

    if row["category"] == "书籍" and row["is_series"] and vols:
        total = sum(float(v.get("purchase_price_cny") or 0) for v in vols)
        # Fallback to series-level price if no volumes have prices
        if total <= 0:
            total = float(row["purchase_price_cny"] or 0)
    else:
        total = float(row["purchase_price_cny"] or 0)

    return {
        "id": row["id"], "name": row["name"], "category": row["category"],
        "series_name": row["series_name"] or row["name"], "status": status,
        "platform": row["platform"], "purchase_price": row["purchase_price"],
        "purchase_currency": row["purchase_currency"], "purchase_price_cny": row["purchase_price_cny"],
        "purchase_fx_rate_to_cny": row["purchase_fx_rate_to_cny"],
        "purchase_fx_rate_timestamp": row["purchase_fx_rate_timestamp"],
        "list_price_amount": row["list_price_amount"], "list_price_currency": row["list_price_currency"],
        "list_price_cny": row["list_price_cny"], "list_fx_rate_to_cny": row["list_fx_rate_to_cny"],
        "list_fx_rate_timestamp": row["list_fx_rate_timestamp"],
        "book_edition_type": row["book_edition_type"], "author": row["author"], "publisher": row["publisher"],
        "book_volumes": vols, "purchase_date": row["purchase_date"], "tags": tags, "notes": row["notes"],
        "image_data": row["image_data"], "sort_order": row["sort_order"],
        "created_at": row["created_at"], "updated_at": row["updated_at"],
        "total_spent_cny": round(total, 2), "volume_count": len(vols),
        "is_series": bool(row["is_series"]), "is_private": bool(row["is_private"]),
        "manufacturer": row["manufacturer"],
    }


def collect_image_refs(image_data=None, book_volumes=None):
    refs = set()
    if image_data and is_uploaded_image_path(image_data):
        refs.add(str(image_data).strip())
    for volume in book_volumes or []:
        if not isinstance(volume, dict):
            continue
        cover = volume.get("cover_image_data")
        if cover and is_uploaded_image_path(cover):
            refs.add(str(cover).strip())
    return refs


def image_ref_is_still_used(conn: sqlite3.Connection, image_path: str) -> bool:
    rows = conn.execute("SELECT image_data, book_volumes_json FROM collections").fetchall()
    for row in rows:
        if row["image_data"] == image_path:
            return True
        raw = row["book_volumes_json"] or ""
        if not raw:
            continue
        try:
            volumes = json.loads(raw)
        except json.JSONDecodeError:
            continue
        for volume in volumes:
            if isinstance(volume, dict) and volume.get("cover_image_data") == image_path:
                return True
    return False


def delete_unused_uploaded_images(conn: sqlite3.Connection, image_paths):
    for image_path in image_paths:
        if not image_path or not is_uploaded_image_path(image_path):
            continue
        if image_ref_is_still_used(conn, image_path):
            continue
        filename = str(image_path).strip()[len(UPLOADS_URL_PREFIX):]
        target = UPLOADS_DIR / filename
        if target.exists():
            try:
                target.unlink()
            except OSError:
                pass


def uploaded_filename_from_path(image_path):
    text = str(image_path or "").strip()
    if not is_uploaded_image_path(text):
        return None
    return text[len(UPLOADS_URL_PREFIX):]


def collect_items_image_refs(items):
    refs = set()
    for item in items or []:
        if not isinstance(item, dict):
            continue
        refs.update(collect_image_refs(item.get("image_data"), item.get("book_volumes")))
    return refs


def build_backup_archive(conn: sqlite3.Connection) -> bytes:
    rows = conn.execute("SELECT * FROM collections ORDER BY sort_order, id").fetchall()
    items = [row_to_item(row) for row in rows]
    refs = sorted(collect_items_image_refs(items))
    uploads = []
    missing_uploads = []

    for image_path in refs:
        filename = uploaded_filename_from_path(image_path)
        if not filename:
            continue
        target = UPLOADS_DIR / filename
        if target.is_file():
            uploads.append((filename, target))
        else:
            missing_uploads.append(filename)

    manifest = {
        "app": "Neko Collection",
        "version": BACKUP_VERSION,
        "exported_at": now_iso(),
        "image_storage": "file",
        "item_count": len(items),
        "upload_file_count": len(uploads),
        "missing_uploads": missing_uploads,
    }
    payload = {"items": items}

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("items.json", json.dumps(payload, ensure_ascii=False, indent=2))
        for filename, target in uploads:
            archive.write(target, arcname=f"uploads/{filename}")
    return buffer.getvalue()


def parse_backup_archive(data: bytes):
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise ValueError("备份文件不是有效的 ZIP 压缩包") from exc

    with archive:
        names = set(archive.namelist())
        if "items.json" not in names:
            raise ValueError("备份包中缺失 items.json")

        try:
            payload = json.loads(archive.read("items.json").decode("utf-8"))
        except Exception as exc:
            raise ValueError("备份中的 items.json 无效") from exc

        items = payload.get("items")
        if not isinstance(items, list):
            raise ValueError("备份中的 items.json 必须包含项目数组")

        manifest = {}
        if "manifest.json" in names:
            try:
                manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            except Exception as exc:
                raise ValueError("备份中的 manifest.json 无效") from exc

        refs = sorted(collect_items_image_refs(items))
        uploads = {}
        missing_uploads = []
        for image_path in refs:
            filename = uploaded_filename_from_path(image_path)
            if not filename:
                continue
            arcname = f"uploads/{filename}"
            if arcname not in names:
                missing_uploads.append(filename)
                continue
            uploads[filename] = archive.read(arcname)

        if missing_uploads:
            raise ValueError(f"备份包缺失 {len(missing_uploads)} 个引用的图片文件")

    return {"items": items, "manifest": manifest, "uploads": uploads}


def restore_backup_uploads(upload_files):
    for filename, data in (upload_files or {}).items():
        if not filename or "/" in filename or "\\" in filename:
            raise ValueError("Backup archive contains an invalid upload file name")
        (UPLOADS_DIR / filename).write_bytes(data)


def summarize_backup(backup):
    manifest = backup.get("manifest") or {}
    items = backup.get("items") or []
    uploads = backup.get("uploads") or {}
    return {
        "app": manifest.get("app") or "Neko Collection",
        "version": manifest.get("version") or BACKUP_VERSION,
        "exported_at": manifest.get("exported_at"),
        "item_count": len(items),
        "upload_file_count": len(uploads),
    }


def parse_backup_schedule_time():
    try:
        hour_text, minute_text = AUTO_BACKUP_TIME.split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
    except Exception:
        return 3, 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return 3, 0
    return hour, minute


def list_local_backup_files():
    return sorted(
        [path for path in BACKUPS_DIR.glob(f"{BACKUP_FILE_PREFIX}*.zip") if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def prune_local_backups():
    for stale in list_local_backup_files()[MAX_LOCAL_BACKUPS:]:
        try:
            stale.unlink()
        except OSError:
            pass


def backup_path_for_date(day_value):
    return BACKUPS_DIR / f"{BACKUP_FILE_PREFIX}{day_value.isoformat()}.zip"


def is_valid_backup_filename(filename):
    text = str(filename or "").strip()
    return bool(text) and text.startswith(BACKUP_FILE_PREFIX) and text.endswith(".zip") and "/" not in text and "\\" not in text


def local_backup_path(filename):
    if not is_valid_backup_filename(filename):
        raise ValueError("无效的备份文件名")
    return BACKUPS_DIR / filename


def summarize_backup_file(path):
    if not path.is_file():
        raise FileNotFoundError(path.name)
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        manifest = {}
        if "manifest.json" in names:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        item_count = None
        if "items.json" in names:
            payload = json.loads(archive.read("items.json").decode("utf-8"))
            items = payload.get("items")
            if isinstance(items, list):
                item_count = len(items)
        upload_count = len([name for name in names if name.startswith("uploads/") and not name.endswith("/")])
    stat = path.stat()
    return {
        "file_name": path.name,
        "file_size": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        "app": manifest.get("app") or "Neko Collection",
        "version": manifest.get("version") or BACKUP_VERSION,
        "exported_at": manifest.get("exported_at"),
        "item_count": item_count if item_count is not None else manifest.get("item_count") or 0,
        "upload_file_count": upload_count if upload_count is not None else manifest.get("upload_file_count") or 0,
    }


def list_local_backup_summaries():
    summaries = []
    for path in list_local_backup_files():
        try:
            summaries.append(summarize_backup_file(path))
        except Exception:
            summaries.append({
                "file_name": path.name,
                "file_size": path.stat().st_size,
                "modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
                "app": "Neko Collection",
                "version": BACKUP_VERSION,
                "exported_at": None,
                "item_count": 0,
                "upload_file_count": 0,
                "is_broken": True,
            })
    return summaries


def create_local_backup_for_day(day_value):
    target = backup_path_for_date(day_value)
    with backup_lock:
        if target.exists():
            prune_local_backups()
            return target, False
        conn = get_conn()
        try:
            body = build_backup_archive(conn)
        finally:
            conn.close()
        temp_target = target.with_suffix(".zip.tmp")
        temp_target.write_bytes(body)
        temp_target.replace(target)
        prune_local_backups()
    return target, True


def create_manual_backup():
    timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    target = BACKUPS_DIR / f"{BACKUP_FILE_PREFIX}{timestamp}.zip"
    with backup_lock:
        conn = get_conn()
        try:
            body = build_backup_archive(conn)
        finally:
            conn.close()
        temp_target = target.with_suffix(".zip.tmp")
        temp_target.write_bytes(body)
        temp_target.replace(target)
        prune_local_backups()
    return target


def auto_backup_worker():
    hour, minute = parse_backup_schedule_time()
    while True:
        try:
            now = datetime.now()
            if (now.hour, now.minute) >= (hour, minute):
                target, created = create_local_backup_for_day(now.date())
                if created:
                    print(f"[auto-backup] created backup: {target.name}")
        except Exception as exc:
            print(f"[auto-backup] failed: {exc}")
        time.sleep(AUTO_BACKUP_POLL_SECONDS)


class NekoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/me": self.handle_me(); return
        if parsed.path == "/api/rates": self.handle_get_rates(); return
        if parsed.path == "/api/items": self.handle_list_items(parsed); return
        if parsed.path == "/api/stats": self.handle_stats(); return
        if parsed.path == "/api/suggestions": self.handle_suggestions(); return
        if parsed.path == "/api/backups": self.handle_list_backups(); return
        if parsed.path == "/api/export": self.handle_export(); return
        if parsed.path == "/api/export-backup": self.handle_export_backup(); return
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "items":
            self.handle_get_item(parts[2]); return
        if parsed.path == "/": self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/login": self.handle_login(); return
        if parsed.path == "/api/logout": self.handle_logout(); return
        if parsed.path == "/api/items": self.handle_create_item(); return
        if parsed.path == "/api/clear-data": self.handle_clear_data(); return
        if parsed.path == "/api/delete-local-backup": self.handle_delete_local_backup(); return
        if parsed.path == "/api/import": self.handle_import(); return
        if parsed.path == "/api/preview-local-backup": self.handle_preview_local_backup(); return
        if parsed.path == "/api/preview-backup": self.handle_preview_backup(); return
        if parsed.path == "/api/restore-local-backup": self.handle_restore_local_backup(); return
        if parsed.path == "/api/import-backup": self.handle_import_backup(); return
        if parsed.path == "/api/change-password": self.handle_change_password(); return
        if parsed.path == "/api/rates/update": self.handle_update_rates(); return
        if parsed.path == "/api/download-image": self.handle_download_image(); return
        if parsed.path == "/api/create-backup": self.handle_create_backup(); return
        self.send_json(404, {"error": "未找到"})

    def do_PUT(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "items":
            self.handle_update_item(parts[2]); return
        self.send_json(404, {"error": "未找到"})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "items":
            self.handle_delete_item(parts[2]); return
        self.send_json(404, {"error": "未找到"})

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        return self.rfile.read(length) if length > 0 else b""

    def read_json(self):
        try:
            body = self.read_body()
            return json.loads(body.decode("utf-8")) if body else {}
        except Exception: return {}

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, status, content_type, body, filename=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def require_auth(self):
        user = self.get_auth_user()
        if not user:
            # get_auth_user already sent 401 if it failed and returned None?
            # No, let's make get_auth_user NOT send response.
            pass
        return user

    def get_auth_user(self, send_error=True):
        token = self.headers.get("Authorization", "")[7:].strip() if self.headers.get("Authorization", "").startswith("Bearer ") else None
        if not token:
            if send_error: self.send_json(401, {"error": "请先登录"})
            return None
        with get_conn() as conn:
            row = conn.execute("SELECT s.user_id, u.username, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?", (token,)).fetchone()
            expires_at = compact_date_text(row["expires_at"]) if row else None
            if not row or not expires_at or date.fromisoformat(expires_at) < now_utc().date():
                if row: conn.execute("DELETE FROM sessions WHERE token=?", (token,))
                if send_error: self.send_json(401, {"error": "登录已过期"})
                return None
        return {"user_id": row["user_id"], "username": row["username"]}

    def handle_login(self):
        payload = self.read_json()
        password = str(payload.get("password", ""))
        username = str(payload.get("username", "")).strip() or DEFAULT_ADMIN_USERNAME
        with get_conn() as conn:
            row = conn.execute("SELECT id, username, password_hash FROM users WHERE username=?", (username,)).fetchone()
            if not row or row["password_hash"] != hash_password(password):
                self.send_json(401, {"error": "密码错误"}); return
            token = secrets.token_urlsafe(32)
            expires = (now_utc() + timedelta(days=SESSION_TTL_DAYS)).date().isoformat()
            conn.execute("INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", (token, row["id"], now_iso(), expires))
        self.send_json(200, {"token": token, "user": {"id": row["id"], "username": row["username"]}})

    def handle_logout(self):
        token = self.headers.get("Authorization", "")[7:].strip()
        if token:
            with get_conn() as conn: conn.execute("DELETE FROM sessions WHERE token=?", (token,))
        self.send_json(200, {"ok": True})

    def handle_me(self):
        user = self.get_auth_user(send_error=False)
        if not user: self.send_json(200, {"logged_in": False}); return
        self.send_json(200, {"logged_in": True, "user": user})

    def handle_get_rates(self):
        with get_conn() as conn:
            rows = conn.execute("SELECT currency, rate_to_cny, updated_at FROM exchange_rates").fetchall()
        self.send_json(200, {"rates": [dict(r) for r in rows]})

    def handle_suggestions(self):
        if not self.require_auth(): return
        with get_conn() as conn:
            names = [r[0] for r in conn.execute("SELECT DISTINCT name FROM collections WHERE name IS NOT NULL").fetchall()]
            authors = [r[0] for r in conn.execute("SELECT DISTINCT author FROM collections WHERE author IS NOT NULL").fetchall()]
            publishers = [r[0] for r in conn.execute("SELECT DISTINCT publisher FROM collections WHERE publisher IS NOT NULL").fetchall()]
            manufacturers = [r[0] for r in conn.execute("SELECT DISTINCT manufacturer FROM collections WHERE manufacturer IS NOT NULL").fetchall()]
            tag_rows = [r[0] for r in conn.execute("SELECT DISTINCT tags FROM collections WHERE tags IS NOT NULL").fetchall()]
            tags = set()
            for tr in tag_rows:
                for t in tr.split(","):
                    if t.strip(): tags.add(t.strip())
            
            # 同时也抓取分册标题作为建议
            vol_titles = set()
            vol_rows = [r[0] for r in conn.execute("SELECT book_volumes_json FROM collections WHERE book_volumes_json IS NOT NULL").fetchall()]
            for vr in vol_rows:
                try:
                    vols = json.loads(vr)
                    for v in vols:
                        if isinstance(v, dict) and v.get("volume_title"):
                            vol_titles.add(v.get("volume_title").strip())
                except: pass

        self.send_json(200, {
            "name": sorted(names),
            "author": sorted(authors),
            "publisher": sorted(publishers),
            "manufacturer": sorted(manufacturers),
            "tags": sorted(list(tags)),
            "volume_title": sorted(list(vol_titles))
        })

    def handle_list_backups(self):
        if not self.require_auth(): return
        try:
            self.send_json(200, {"backups": list_local_backup_summaries()})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_list_items(self, parsed):
        params = parse_qs(parsed.query)
        where, vals = [], []
        if (params.get("status") or [None])[0] in ALLOWED_STATUSES:
            where.append("status=?"); vals.append(params["status"][0])
        if (params.get("category") or [None])[0]:
            where.append("category=?"); vals.append(params["category"][0])
        
        user = self.get_auth_user(send_error=False)
        private_mode = (params.get("private_mode") or ["false"])[0] == "true"
        if not user or not private_mode:
            where.append("is_private=0")
            
        clause = "WHERE " + " AND ".join(where) if where else ""
        with get_conn() as conn:
            rows = conn.execute(f"SELECT * FROM collections {clause} ORDER BY sort_order, id", vals).fetchall()
        self.send_json(200, {"items": [row_to_item(r) for r in rows]})

    def handle_get_item(self, item_id):
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM collections WHERE id=?", (item_id,)).fetchone()
            if not row: self.send_json(404, {"error": "不存在"}); return
        self.send_json(200, {"item": row_to_item(row)})

    def handle_stats(self):
        with get_conn() as conn:
            rows = conn.execute("SELECT * FROM collections").fetchall()
        items = [row_to_item(r) for r in rows]
        events = []
        for item in items:
            amt = float(item.get("total_spent_cny") or 0)
            if amt <= 0: continue
            
            if item["category"] == "书籍" and item["is_series"] and item["book_volumes"]:
                has_vol_prices = False
                for v in item["book_volumes"]:
                    v_amt = float(v.get("purchase_price_cny") or 0)
                    if v_amt > 0:
                        has_vol_prices = True
                        date = v.get("purchase_date") or item.get("purchase_date") or item.get("created_at") or "未知"
                        events.append({"amount": round(v_amt, 2), "date": date[:10], "category": item["category"]})
                if not has_vol_prices:
                    date = item.get("purchase_date") or item.get("created_at") or "未知"
                    events.append({"amount": round(amt, 2), "date": date[:10], "category": item["category"]})
            else:
                date = item.get("purchase_date") or item.get("created_at") or "未知"
                events.append({"amount": round(amt, 2), "date": date[:10], "category": item["category"]})
        
        self.send_json(200, {"events": events})

    def handle_export(self):
        if not self.require_auth(): return
        with get_conn() as conn:
            rows = conn.execute("SELECT * FROM collections ORDER BY sort_order, id").fetchall()
        self.send_json(200, {"items": [row_to_item(r) for r in rows]})

    def handle_export_backup(self):
        if not self.require_auth(): return
        try:
            with get_conn() as conn:
                body = build_backup_archive(conn)
            self.send_bytes(200, "application/zip", body, f"neko-backup-{now_iso()}.zip")
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_create_backup(self):
        if not self.require_auth(): return
        try:
            target = create_manual_backup()
            self.send_json(200, {"message": f"备份成功: {target.name}"})
        except Exception as e:
            self.send_json(500, {"error": str(e)})

    def handle_import(self):
        if not self.require_auth(): return
        items = self.read_json().get("items", [])
        ts = now_iso()
        with get_conn() as conn:
            old_rows = conn.execute("SELECT * FROM collections").fetchall()
            old_refs = set()
            for old_row in old_rows:
                old_item = row_to_item(old_row)
                old_refs.update(collect_image_refs(old_item.get("image_data"), old_item.get("book_volumes")))
            rates = get_rates_map(conn)
            conn.execute("DELETE FROM collections")
            for item in items:
                norm = normalize_item_payload(item, rates)
                conn.execute("INSERT INTO collections (name, category, series_name, status, platform, purchase_price, purchase_currency, purchase_price_cny, purchase_fx_rate_to_cny, purchase_fx_rate_timestamp, list_price_amount, list_price_currency, list_price_cny, list_fx_rate_to_cny, list_fx_rate_timestamp, book_edition_type, author, publisher, purchase_date, tags, notes, image_data, book_volumes_json, sort_order, created_at, updated_at, is_series, is_private, manufacturer) VALUES (:name, :category, :series_name, :status, :platform, :purchase_price, :purchase_currency, :purchase_price_cny, :purchase_fx_rate_to_cny, :purchase_fx_rate_timestamp, :list_price_amount, :list_price_currency, :list_price_cny, :list_fx_rate_to_cny, :list_fx_rate_timestamp, :book_edition_type, :author, :publisher, :purchase_date, :tags, :notes, :image_data, :book_volumes_json, :sort_order, :created_at, :updated_at, :is_series, :is_private, :manufacturer)", {**norm, "created_at": ts, "updated_at": ts})
            new_rows = conn.execute("SELECT * FROM collections").fetchall()
            new_refs = set()
            for new_row in new_rows:
                new_item = row_to_item(new_row)
                new_refs.update(collect_image_refs(new_item.get("image_data"), new_item.get("book_volumes")))
            delete_unused_uploaded_images(conn, old_refs - new_refs)
        self.send_json(200, {"message": f"已导入 {len(items)} 项"})

    def handle_preview_backup(self):
        if not self.require_auth(): return
        try:
            backup = parse_backup_archive(self.read_body())
            self.send_json(200, {"backup": summarize_backup(backup)})
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_preview_local_backup(self):
        if not self.require_auth(): return
        try:
            filename = str(self.read_json().get("file_name", "")).strip()
            self.send_json(200, {"backup": summarize_backup_file(local_backup_path(filename))})
        except FileNotFoundError:
            self.send_json(404, {"error": "未找到备份文件"})
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_import_backup(self):
        if not self.require_auth(): return
        try:
            backup = parse_backup_archive(self.read_body())
            items = backup["items"]
            ts = now_iso()
            with get_conn() as conn:
                old_rows = conn.execute("SELECT * FROM collections").fetchall()
                old_refs = set()
                for old_row in old_rows:
                    old_item = row_to_item(old_row)
                    old_refs.update(collect_image_refs(old_item.get("image_data"), old_item.get("book_volumes")))
                restore_backup_uploads(backup["uploads"])
                rates = get_rates_map(conn)
                conn.execute("DELETE FROM collections")
                for item in items:
                    norm = normalize_item_payload(item, rates)
                    conn.execute("INSERT INTO collections (name, category, series_name, status, platform, purchase_price, purchase_currency, purchase_price_cny, purchase_fx_rate_to_cny, purchase_fx_rate_timestamp, list_price_amount, list_price_currency, list_price_cny, list_fx_rate_to_cny, list_fx_rate_timestamp, book_edition_type, author, publisher, purchase_date, tags, notes, image_data, book_volumes_json, sort_order, created_at, updated_at, is_series, is_private, manufacturer) VALUES (:name, :category, :series_name, :status, :platform, :purchase_price, :purchase_currency, :purchase_price_cny, :purchase_fx_rate_to_cny, :purchase_fx_rate_timestamp, :list_price_amount, :list_price_currency, :list_price_cny, :list_fx_rate_to_cny, :list_fx_rate_timestamp, :book_edition_type, :author, :publisher, :purchase_date, :tags, :notes, :image_data, :book_volumes_json, :sort_order, :created_at, :updated_at, :is_series, :is_private, :manufacturer)", {**norm, "created_at": ts, "updated_at": ts})
                new_rows = conn.execute("SELECT * FROM collections").fetchall()
                new_refs = set()
                for new_row in new_rows:
                    new_item = row_to_item(new_row)
                    new_refs.update(collect_image_refs(new_item.get("image_data"), new_item.get("book_volumes")))
                delete_unused_uploaded_images(conn, old_refs - new_refs)
            self.send_json(200, {"message": f"已从备份恢复 {len(items)} 项"})
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_restore_local_backup(self):
        if not self.require_auth(): return
        try:
            filename = str(self.read_json().get("file_name", "")).strip()
            backup = parse_backup_archive(local_backup_path(filename).read_bytes())
            items = backup["items"]
            ts = now_iso()
            with get_conn() as conn:
                old_rows = conn.execute("SELECT * FROM collections").fetchall()
                old_refs = set()
                for old_row in old_rows:
                    old_item = row_to_item(old_row)
                    old_refs.update(collect_image_refs(old_item.get("image_data"), old_item.get("book_volumes")))
                restore_backup_uploads(backup["uploads"])
                rates = get_rates_map(conn)
                conn.execute("DELETE FROM collections")
                for item in items:
                    norm = normalize_item_payload(item, rates)
                    conn.execute("INSERT INTO collections (name, category, series_name, status, platform, purchase_price, purchase_currency, purchase_price_cny, purchase_fx_rate_to_cny, purchase_fx_rate_timestamp, list_price_amount, list_price_currency, list_price_cny, list_fx_rate_to_cny, list_fx_rate_timestamp, book_edition_type, author, publisher, purchase_date, tags, notes, image_data, book_volumes_json, sort_order, created_at, updated_at, is_series, is_private, manufacturer) VALUES (:name, :category, :series_name, :status, :platform, :purchase_price, :purchase_currency, :purchase_price_cny, :purchase_fx_rate_to_cny, :purchase_fx_rate_timestamp, :list_price_amount, :list_price_currency, :list_price_cny, :list_fx_rate_to_cny, :list_fx_rate_timestamp, :book_edition_type, :author, :publisher, :purchase_date, :tags, :notes, :image_data, :book_volumes_json, :sort_order, :created_at, :updated_at, :is_series, :is_private, :manufacturer)", {**norm, "created_at": ts, "updated_at": ts})
                new_rows = conn.execute("SELECT * FROM collections").fetchall()
                new_refs = set()
                for new_row in new_rows:
                    new_item = row_to_item(new_row)
                    new_refs.update(collect_image_refs(new_item.get("image_data"), new_item.get("book_volumes")))
                delete_unused_uploaded_images(conn, old_refs - new_refs)
            self.send_json(200, {"message": f"已从 {filename} 恢复 {len(items)} 项"})
        except FileNotFoundError:
            self.send_json(404, {"error": "未找到备份文件"})
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_delete_local_backup(self):
        if not self.require_auth(): return
        try:
            filename = str(self.read_json().get("file_name", "")).strip()
            path = local_backup_path(filename)
            if not path.is_file():
                self.send_json(404, {"error": "Backup file not found"})
                return
            path.unlink()
            self.send_json(200, {"message": f"备份 {filename} 已成功删除"})
        except FileNotFoundError:
            self.send_json(404, {"error": "Backup file not found"})
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_clear_data(self):
        if not self.require_auth(): return
        try:
            with get_conn() as conn:
                rows = conn.execute("SELECT * FROM collections").fetchall()
                old_refs = set()
                for row in rows:
                    item = row_to_item(row)
                    old_refs.update(collect_image_refs(item.get("image_data"), item.get("book_volumes")))
                conn.execute("DELETE FROM collections")
                delete_unused_uploaded_images(conn, old_refs)
            self.send_json(200, {"message": "当前数据已清空"})
        except Exception as e:
            self.send_json(400, {"error": str(e)})

    def handle_change_password(self):
        user = self.require_auth()
        if not user: return
        pwd = str(self.read_json().get("new_password", "")).strip()
        if len(pwd) < 6: self.send_json(400, {"error": "密码至少6位"}); return
        with get_conn() as conn:
            conn.execute("UPDATE users SET password_hash=?, updated_at=? WHERE id=?", (hash_password(pwd), now_iso(), user["user_id"]))
        self.send_json(200, {"message": "修改成功"})

    def handle_update_rates(self):
        if not self.require_auth(): return
        import urllib.request
        try:
            with urllib.request.urlopen("https://api.exchangerate-api.com/v4/latest/CNY", timeout=10) as resp:
                data = json.loads(resp.read())["rates"]
                ts = now_iso()
                with get_conn() as conn:
                    for c in ALLOWED_CURRENCIES:
                        if c in data:
                            rate = 1.0 if c == "CNY" else round(1.0 / data[c], 6)
                            conn.execute("INSERT INTO exchange_rates(currency, rate_to_cny, updated_at) VALUES (?, ?, ?) ON CONFLICT(currency) DO UPDATE SET rate_to_cny=excluded.rate_to_cny, updated_at=excluded.updated_at", (c, rate, ts))
                self.send_json(200, {"message": "汇率已更新"})
        except Exception as e: self.send_json(500, {"error": str(e)})

    def handle_create_item(self):
        if not self.require_auth(): return
        try:
            with get_conn() as conn:
                norm = normalize_item_payload(self.read_json(), get_rates_map(conn))
                ts = now_iso()
                cursor = conn.execute("INSERT INTO collections (name, category, series_name, status, platform, purchase_price, purchase_currency, purchase_price_cny, purchase_fx_rate_to_cny, purchase_fx_rate_timestamp, list_price_amount, list_price_currency, list_price_cny, list_fx_rate_to_cny, list_fx_rate_timestamp, book_edition_type, author, publisher, purchase_date, tags, notes, image_data, book_volumes_json, sort_order, created_at, updated_at, is_series, is_private, manufacturer) VALUES (:name, :category, :series_name, :status, :platform, :purchase_price, :purchase_currency, :purchase_price_cny, :purchase_fx_rate_to_cny, :purchase_fx_rate_timestamp, :list_price_amount, :list_price_currency, :list_price_cny, :list_fx_rate_to_cny, :list_fx_rate_timestamp, :book_edition_type, :author, :publisher, :purchase_date, :tags, :notes, :image_data, :book_volumes_json, :sort_order, :created_at, :updated_at, :is_series, :is_private, :manufacturer)", {**norm, "created_at": ts, "updated_at": ts})
                row = conn.execute("SELECT * FROM collections WHERE id=?", (cursor.lastrowid,)).fetchone()
            self.send_json(201, {"item": row_to_item(row)})
        except Exception as e: self.send_json(400, {"error": str(e)})

    def handle_update_item(self, item_id):
        if not self.require_auth(): return
        try:
            with get_conn() as conn:
                old = conn.execute("SELECT * FROM collections WHERE id=?", (item_id,)).fetchone()
                if not old: self.send_json(404, {"error": "未找到"}); return
                old_item = row_to_item(old)
                old_refs = collect_image_refs(old_item.get("image_data"), old_item.get("book_volumes"))
                norm = normalize_item_payload(self.read_json(), get_rates_map(conn), old_item)
                norm["id"], norm["updated_at"] = item_id, now_iso()
                conn.execute("UPDATE collections SET name=:name, category=:category, series_name=:series_name, status=:status, platform=:platform, purchase_price=:purchase_price, purchase_currency=:purchase_currency, purchase_price_cny=:purchase_price_cny, purchase_fx_rate_to_cny=:purchase_fx_rate_to_cny, purchase_fx_rate_timestamp=:purchase_fx_rate_timestamp, list_price_amount=:list_price_amount, list_price_currency=:list_price_currency, list_price_cny=:list_price_cny, list_fx_rate_to_cny=:list_fx_rate_to_cny, list_fx_rate_timestamp=:list_fx_rate_timestamp, book_edition_type=:book_edition_type, author=:author, publisher=:publisher, purchase_date=:purchase_date, tags=:tags, notes=:notes, image_data=:image_data, book_volumes_json=:book_volumes_json, sort_order=:sort_order, updated_at=:updated_at, is_series=:is_series, is_private=:is_private, manufacturer=:manufacturer WHERE id=:id", norm)
                row = conn.execute("SELECT * FROM collections WHERE id=?", (item_id,)).fetchone()
                new_item = row_to_item(row)
                new_refs = collect_image_refs(new_item.get("image_data"), new_item.get("book_volumes"))
                delete_unused_uploaded_images(conn, old_refs - new_refs)
            self.send_json(200, {"item": row_to_item(row)})
        except Exception as e: self.send_json(400, {"error": str(e)})

    def handle_delete_item(self, item_id):
        if not self.require_auth(): return
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM collections WHERE id=?", (item_id,)).fetchone()
            if not row:
                self.send_json(404, {"error": "未找到项目"}); return
            item = row_to_item(row)
            old_refs = collect_image_refs(item.get("image_data"), item.get("book_volumes"))
            conn.execute("DELETE FROM collections WHERE id=?", (item_id,))
            delete_unused_uploaded_images(conn, old_refs)
        self.send_json(200, {"ok": True})

    def handle_download_image(self):
        if not self.require_auth(): return
        payload = self.read_json()
        url = payload.get("url")
        if not url:
            self.send_json(400, {"error": "URL 不能为空"})
            return
        
        try:
            req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=15) as resp:
                content_type = resp.headers.get("Content-Type", "")
                if not content_type.startswith("image/"):
                    self.send_json(400, {"error": "链接不是有效的图片"})
                    return
                data = resp.read()
                if len(data) > MAX_IMAGE_DATA_LENGTH:
                    self.send_json(400, {"error": "图片过大"})
                    return
                image_path = save_image_bytes(data, content_type)
                self.send_json(200, {"image_data": image_path})
        except Exception as e:
            self.send_json(500, {"error": f"下载失败: {str(e)}"})


def run_server(argv=None):
    options = parse_startup_options(argv)
    init_db(options.get("admin_password"))
    if AUTO_BACKUP_ENABLED:
        worker = threading.Thread(target=auto_backup_worker, name="neko-auto-backup", daemon=True)
        worker.start()
        print(f"[auto-backup] enabled at {AUTO_BACKUP_TIME}, keep latest {MAX_LOCAL_BACKUPS}")
    server = ThreadingHTTPServer((HOST, PORT), NekoHandler)
    print(f"Neko Collection running at http://{HOST}:{PORT}")
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()

if __name__ == "__main__":
    try:
        run_server()
    except ValueError as exc:
        print(f"Startup error: {exc}")
        print("Usage: python backend/server.py [-pw <initial_password>]")
        raise SystemExit(2)
