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

  const channels = {};
  const pairs = [
    [env.ARCHIVE_CHAT_ID, "Archive 1"],
    [env.ARCHIVE_CHAT_ID_2, "Archive 2"],
    [env.ARCHIVE_CHANNEL1, "Archive 1"],
    [env.ARCHIVE_CHANNEL2, "Archive 2"],
  ];
  for (const [id, label] of pairs) {
    if (id) channels[String(id)] = { label };
  }
  return channels;
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
