import sys, time, urllib.request, urllib.error, os
SP = sys.argv[1]; only = set(sys.argv[2:])
UA = "KymaBirds/0.1 (personal art project)"
for line in open(os.path.join(SP, 'tools/photos.tsv')):
    slug, url = line.strip().split('\t')
    if only and slug not in only: continue
    dest = os.path.join(SP, 'assets-raw', slug, 'photo-src.jpg')
    if os.path.exists(dest) and open(dest,'rb').read(3) == b'\xff\xd8\xff':
        print(slug, 'already ok'); continue
    name = url.rsplit('/', 1)[1]
    t = url.replace('/commons/', '/commons/thumb/', 1) + '/1920px-' + name
    req = urllib.request.Request(t, headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read(); print(slug, r.status, r.headers.get('content-type'), len(data))
            if data[:3] == b'\xff\xd8\xff':
                open(dest, 'wb').write(data)
    except urllib.error.HTTPError as e:
        print(slug, 'HTTP', e.code, e.headers.get('retry-after'))
    time.sleep(10)
