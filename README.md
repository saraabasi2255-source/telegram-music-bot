# جستجوی آهنگ چنل تلگرام (Cloudflare Pages + D1 + GitHub)

مینی‌اپ تلگرامی برای جستجوی دقیق آهنگ‌های آپلود شده توی چنل و رفتن مستقیم به همون پیام.

## ساختار پروژه

```
telegram-song-search/
  public/              -> فرانت‌اند مینی‌اپ (index.html, app.js, style.css)
  functions/api/search.js  -> API سرچ (Cloudflare Pages Function)
  functions/webhook.js     -> وبهوک بات تلگرام
  schema.sql            -> اسکیمای دیتابیس D1
  scripts/export_channel.py -> اسکریپت یک‌باره برای خوندن تاریخچه چنل
  wrangler.toml
```

## مرحله ۱ - آپلود روی گیت‌هاب

```bash
cd telegram-song-search
git init
git add .
git commit -m "init"
gh repo create telegram-song-search --public --source=. --push
# یا از رابط وب github.com یه ریپوی جدید بساز و پوش کن
```

## مرحله ۲ - ساخت دیتابیس D1

با CLI ونگلر (اگه نداری: `npm i -g wrangler`):

```bash
wrangler login
wrangler d1 create song_search_db
```

خروجی این دستور یه `database_id` بهت می‌ده؛ بذارش توی `wrangler.toml` جای
`PUT_YOUR_D1_DATABASE_ID_HERE`.

سپس اسکیما رو روی دیتابیس اجرا کن:

```bash
wrangler d1 execute song_search_db --remote --file=./schema.sql
```

## مرحله ۳ - وصل کردن ریپو به Cloudflare Pages

1. برو به داشبورد Cloudflare > **Workers & Pages** > **Create** > **Pages** > **Connect to Git**
2. ریپوی گیت‌هابت رو انتخاب کن
3. تنظیمات build:
   - Build command: خالی بذار (چیزی نیاز نیست بیلد بشه)
   - Build output directory: `public`
4. توی **Settings > Functions > D1 database bindings** دیتابیس `song_search_db`
   رو با نام `DB` بایند کن (دقیقا همین اسم چون توی کد `env.DB` صداش می‌زنیم)
5. توی **Settings > Environment variables** این‌ها رو اضافه کن:
   - `BOT_TOKEN` = توکن باتت
   - `CHANNEL_USERNAME` = یوزرنیم چنل بدون @
   - `MINIAPP_URL` = بعد از اولین دیپلوی، آدرس `https://xxxx.pages.dev` که Cloudflare بهت میده رو اینجا بذار (و دوباره دیپلوی کن)
   - `WEBHOOK_SECRET` = یه رشته رندوم دلخواه (مثلا با `openssl rand -hex 16`)

هر بار که به شاخه‌ی اصلی گیت‌هاب پوش کنی، Cloudflare خودکار دوباره دیپلوی می‌کنه.

## مرحله ۴ - وصل کردن وبهوک بات به این پروژه

بعد از اینکه آدرس نهایی رو داری (مثلا `https://telegram-song-search.pages.dev`):

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://telegram-song-search.pages.dev/webhook",
    "secret_token": "همون WEBHOOK_SECRET که ست کردی",
    "allowed_updates": ["message", "channel_post"]
  }'
```

از این به بعد هر آهنگ جدیدی که توی چنل آپلود بشه (چون باتت اونجا ادمینه)
خودکار توی دیتابیس ثبت می‌شه.

## مرحله ۵ - وارد کردن آهنگ‌های قدیمی (تاریخچه چنل)

بات معمولی فقط پیام‌های *جدید* رو می‌بینه، برای تاریخچه باید یه بار با
اکانت شخصی خودت (که ادمین چنله) از Telethon استفاده کنی:

```bash
pip install telethon
```

مقادیر `API_ID` و `API_HASH` رو از https://my.telegram.org بگیر و توی
`scripts/export_channel.py` جایگزین کن، بعد:

```bash
cd scripts
python export_channel.py
```

این یه فایل `import.sql` می‌سازه. سپس:

```bash
wrangler d1 execute song_search_db --remote --file=./scripts/import.sql
```

## مرحله ۶ - ثبت مینی‌اپ روی بات (BotFather)

توی چت با [@BotFather](https://t.me/BotFather):

```
/mybots -> انتخاب بات -> Bot Settings -> Menu Button -> Configure Menu Button
```

آدرس مینی‌اپ (`https://telegram-song-search.pages.dev`) رو بذار.
همچنین می‌تونی از `/newapp` برای ثبت رسمی Web App استفاده کنی.

از این به بعد کاربرا با زدن دکمه‌ی منو یا `/start` مینی‌اپ رو باز می‌کنن،
سرچ می‌کنن و با زدن روی نتیجه مستقیم می‌رن سراغ همون پیام توی چنل.

## نکات

- سرچ فعلی از `LIKE` استفاده می‌کنه که برای فارسی و غلط‌های تایپی جزئی خوب کار
  می‌کنه؛ اگه بعدا خواستی فازی‌تر بشه (مثلا تحمل غلط املایی بیشتر) می‌شه یه
  الگوریتم شباهت رشته‌ای (مثل Levenshtein) توی همون Worker اضافه کرد.
- چون چنل پابلیکه، لینک مستقیم پیام همیشه به فرمت
  `https://t.me/<username>/<message_id>` کار می‌کنه.
