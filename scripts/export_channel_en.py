import asyncio
from telethon import TelegramClient
from telethon.tl.types import DocumentAttributeAudio

API_ID = 12345678              # ← API_ID خودت (از my.telegram.org)
API_HASH = "your_api_hash"      # ← API_HASH خودت
CHANNEL_USERNAME = -1004472833014  # ← آیدی عددی چنل انگلیسی
OUTPUT_FILE = "import_en.sql"

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

        title = performer = duration = file_name = None
        for attr in message.audio.attributes:
            if isinstance(attr, DocumentAttributeAudio):
                title = attr.title
                performer = attr.performer
                duration = attr.duration
        if message.file and message.file.name:
            file_name = message.file.name
        caption = message.text or None
        chat_id = message.chat_id  # فرمت -100xxxxxxxxxx، همون که ربات تلگرام هم می‌فهمه

        rows.append(
            "INSERT INTO songs (chat_id, message_id, title, performer, file_name, caption, duration) "
            f"VALUES ({chat_id}, {message.id}, {sql_escape(title)}, {sql_escape(performer)}, "
            f"{sql_escape(file_name)}, {sql_escape(caption)}, "
            f"{duration if duration is not None else 'NULL'}) "
            "ON CONFLICT(message_id) DO UPDATE SET "
            "chat_id=excluded.chat_id, title=excluded.title, performer=excluded.performer, "
            "file_name=excluded.file_name, caption=excluded.caption, duration=excluded.duration;"
        )
        count += 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(rows))

    print(f"تمام شد ✅ {count} آهنگ توی {OUTPUT_FILE} نوشته شد.")
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
