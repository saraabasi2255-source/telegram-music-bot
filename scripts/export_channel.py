"""
اسکریپت یک‌باره: کل پیام‌های صوتی چنل رو می‌خونه و یه فایل import.sql می‌سازه
که بعد با دستور زیر روی دیتابیس D1 اجرا می‌کنی:

    wrangler d1 execute song_search_db --remote --file=./import.sql

نیازمندی‌ها:
    pip install telethon

قبل از اجرا باید این مقادیر رو از my.telegram.org بگیری (اکانت شخصی خودت،
همونی که توی چنل ادمینه):
    API_ID, API_HASH

اجرا:
    python export_channel.py
(بار اول ازت شماره تلفن و کد تایید می‌خواد و یه فایل session می‌سازه)
"""

import asyncio
from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeAudio

API_ID = 12345678          # اینجا رو با API_ID خودت پر کن
API_HASH = "your_api_hash"  # اینجا رو با API_HASH خودت پر کن
CHANNEL_USERNAME = "your_channel_username"  # بدون @

OUTPUT_FILE = "import.sql"


def sql_escape(value):
    if value is None:
        return "NULL"
    value = str(value).replace("'", "''")
    return f"'{value}'"


async def main():
    client = TelegramClient("export_session", API_ID, API_HASH)
    await client.start()

    rows = []
    count = 0

    async for message in client.iter_messages(CHANNEL_USERNAME):
        if not message.audio:
            continue

        title = None
        performer = None
        duration = None
        file_name = None

        for attr in message.audio.attributes:
            if isinstance(attr, DocumentAttributeAudio):
                title = attr.title
                performer = attr.performer
                duration = attr.duration

        if message.file and message.file.name:
            file_name = message.file.name

        caption = message.text or None

        rows.append(
            "INSERT INTO songs (message_id, title, performer, file_name, caption, duration) "
            f"VALUES ({message.id}, {sql_escape(title)}, {sql_escape(performer)}, "
            f"{sql_escape(file_name)}, {sql_escape(caption)}, "
            f"{duration if duration is not None else 'NULL'}) "
            "ON CONFLICT(message_id) DO UPDATE SET "
            "title=excluded.title, performer=excluded.performer, "
            "file_name=excluded.file_name, caption=excluded.caption, "
            "duration=excluded.duration;"
        )
        count += 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(rows))

    print(f"تمام شد ✅ {count} آهنگ توی {OUTPUT_FILE} نوشته شد.")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
