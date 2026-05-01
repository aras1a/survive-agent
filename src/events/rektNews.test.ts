import { strict as assert } from "node:assert";
import { test } from "node:test";

// Force-fetch to a stub so we don't hit the network during tests.
const originalFetch = globalThis.fetch;

const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[ProtocolX rekt for $50M]]></title>
      <link>https://rekt.news/protocolx-rekt</link>
      <guid>https://rekt.news/protocolx-rekt</guid>
      <pubDate>Wed, 30 Apr 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Bridge drained</title>
      <link>https://rekt.news/bridge-rekt</link>
      <guid>rekt-2</guid>
      <pubDate>Wed, 30 Apr 2026 13:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const { RektNewsSource } = await import("./rektNews.js");

test("RektNewsSource parses items and dedupes across polls", async () => {
  globalThis.fetch = (async () =>
    new Response(sampleRss, { status: 200 })) as typeof fetch;
  const src = new RektNewsSource();
  const first = await src.poll();
  assert.equal(first.length, 2);
  assert.match(first[0]!.summary ?? "", /ProtocolX/);
  const second = await src.poll();
  assert.equal(second.length, 0, "second poll should be deduped");
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
