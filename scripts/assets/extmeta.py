import sys, json, re, html, urllib.request, urllib.parse
titles = [l.strip() for l in open(sys.argv[1]) if l.strip()]
params = {'action': 'query', 'format': 'json', 'formatversion': '2', 'prop': 'imageinfo',
          'iiprop': 'extmetadata|size|mime|url', 'iiextmetadatafilter': 'Artist|LicenseShortName|LicenseUrl|Credit|AttributionRequired|Copyrighted|UsageTerms',
          'titles': '|'.join(titles)}
url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
req = urllib.request.Request(url, headers={'User-Agent': 'KymaBirds/0.1 (personal art project)'})
data = json.load(urllib.request.urlopen(req, timeout=60))
json.dump(data, open(sys.argv[2], 'w'), indent=1)
def clean(s):
    s = re.sub(r'<[^>]+>', '', s or ''); s = html.unescape(s); return re.sub(r'\s+', ' ', s).strip()
for p in data['query']['pages']:
    ii = (p.get('imageinfo') or [{}])[0]; em = ii.get('extmetadata', {})
    g = lambda k: clean(em.get(k, {}).get('value'))
    print(p['title'], '|', g('Artist'), '|', g('LicenseShortName'), '|', g('LicenseUrl'), '|', ii.get('mime'), ii.get('width'), ii.get('height'), ii.get('size'), '| credit:', g('Credit')[:120])
