import { logger } from "../logger.js";
import type { EventSource, RawEvent } from "./types.js";

const REKT_RSS = "https://rekt.news/rss/feed.xml";

interface RssItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
    const guidMatch = block.match(/<guid[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/guid>/);
    const dateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (titleMatch && linkMatch) {
      items.push({
        title: decodeEntities(titleMatch[1]?.trim() ?? ""),
        link: (linkMatch[1] ?? "").trim(),
        guid: (guidMatch?.[1] ?? linkMatch[1] ?? "").trim(),
        pubDate: (dateMatch?.[1] ?? "").trim(),
      });
    }
  }
  return items;
}

export class RektNewsSource implements EventSource {
  readonly name = "rekt-news";
  private seen = new Set<string>();

  async poll(): Promise<RawEvent[]> {
    let xml: string;
    try {
      const res = await fetch(REKT_RSS, { headers: { accept: "application/rss+xml" } });
      if (!res.ok) {
        logger.debug({ status: res.status }, "rekt.news RSS non-OK");
        return [];
      }
      xml = await res.text();
    } catch (err) {
      logger.debug({ err }, "rekt.news fetch failed");
      return [];
    }
    const items = parseRss(xml);
    const fresh: RawEvent[] = [];
    for (const item of items) {
      if (this.seen.has(item.guid)) continue;
      this.seen.add(item.guid);
      fresh.push({
        id: `rekt:${item.guid}`,
        category: "exploit_alert",
        source: this.name,
        timestamp: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        payload: { title: item.title, link: item.link },
        summary: `[rekt.news] ${item.title} -- ${item.link}`,
      });
    }
    // Bound memory growth.
    if (this.seen.size > 1000) {
      const arr = Array.from(this.seen);
      this.seen = new Set(arr.slice(-500));
    }
    return fresh;
  }
}
