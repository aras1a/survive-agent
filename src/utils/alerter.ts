import { env } from "../config.js";
import { logger } from "../logger.js";

/**
 * Lightweight Telegram alerter. Sends a message via the Bot API.
 * No-ops gracefully when TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are unset.
 */
export async function alertTelegram(text: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: text.slice(0, 3500),
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "telegram non-OK");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "telegram send failed");
    return false;
  }
}
