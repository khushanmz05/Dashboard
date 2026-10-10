const assert = require("node:assert/strict");
const { test } = require("node:test");
const dns = require("node:dns").promises;
const { fetchWidgetData } = require("../server/providers");

const feed = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[BBC headline: science & technology]]></title>
    <link>https://www.bbc.co.uk/news/articles/first?one=1&amp;two=2</link>
    <author><![CDATA[News editor]]></author>
  </item>
  <item>
    <title><![CDATA[News from <b>London</b>]]></title>
    <link>/news/second</link>
  </item>
  <item><title>A &amp; B: &lt;example&gt; &#8212; &#x1F30D;</title></item>
  <item><title>  </title></item>
</channel></rss>`;

function mockFeed(t, xml) {
  t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
  t.mock.method(globalThis, "fetch", async () => new Response(xml, {
    headers: { "content-type": "text/xml" },
  }));
}

function widget(name = "article_list", number = 5) {
  return {
    service_name: "rss", widget_name: name,
    configuration: { link: "https://feeds.example.org/news/rss.xml", number },
  };
}

test("BBC-style CDATA titles survive extraction with valid links and authors", async (t) => {
  mockFeed(t, feed);
  const result = await fetchWidgetData(widget());
  assert.deepEqual(result.items.map(item => item.title), [
    "BBC headline: science & technology",
    "News from  London",
    "A & B: <example> — 🌍",
    "Untitled article",
  ]);
  assert.equal(result.items[0].detail, "News editor");
  assert.equal(result.items[0].url, "https://www.bbc.co.uk/news/articles/first?one=1&two=2");
  assert.equal(result.items[1].url, "https://feeds.example.org/news/second");
});

test("latest article uses the same CDATA extraction", async (t) => {
  mockFeed(t, feed);
  const result = await fetchWidgetData(widget("latest_article"));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, "BBC headline: science & technology");
});

test("article counts and list limits are preserved", async (t) => {
  mockFeed(t, feed);
  assert.equal((await fetchWidgetData(widget("article_count"))).value, 4);
  assert.equal((await fetchWidgetData(widget("article_list", 2))).items.length, 2);
});

test("Atom titles, nested author text and relative href links still work", async (t) => {
  mockFeed(t, `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title type="text">Plain &amp; readable</title>
    <link href="/article"/>
    <author><name>Editor</name></author>
  </entry></feed>`);
  const result = await fetchWidgetData(widget());
  assert.deepEqual(result.items[0], {
    title: "Plain & readable", detail: "Editor", url: "https://feeds.example.org/article",
  });
});
