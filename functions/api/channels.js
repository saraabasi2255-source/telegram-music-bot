// GET /api/channels
// لیست چنل‌های آرشیو (برای ساختن دکمه‌های فیلتر توی مینی‌اپ)

export async function onRequestGet(context) {
  const { env } = context;

  const channels = getArchiveChannels(env);

  const list = Object.entries(channels).map(([chatId, info]) => ({
    chat_id: chatId,
    label: info.label || chatId,
  }));

  return json({ channels: list });
}

function getArchiveChannels(env) {
  if (env.ARCHIVE_CHANNELS) {
    try {
      return JSON.parse(env.ARCHIVE_CHANNELS);
    } catch (e) {
      return {};
    }
  }
  if (env.ARCHIVE_CHAT_ID) {
    return { [String(env.ARCHIVE_CHAT_ID)]: { label: "همه", username: env.CHANNEL_USERNAME || "" } };
  }
  return {};
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
