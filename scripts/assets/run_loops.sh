#!/bin/zsh
# usage: run_loops.sh SP [slug...]
SP=$1; shift
while IFS=$'\t' read slug args; do
  if [ $# -gt 0 ] && ! (( ${@[(Ie)$slug]} )); then continue; fi
  uv run -q --with numpy --with pillow python -I $SP/tools/process_audio.py render --slug $slug \
    --src $SP/assets-raw/$slug/song-src.mp3 --work $SP/work/audio/$slug \
    --out $SP/assets-out/public/birds --specdir $SP/assets-out/spectrograms ${=args} > $SP/work/audio/$slug/render.log 2>&1 \
    || { echo "FAIL $slug"; tail -5 $SP/work/audio/$slug/render.log; continue; }
  python3 -I -c "
import json,sys
s=json.load(open('$SP/work/audio/$slug/stats.json'))
d=s['decoded']; b=s['band']
print(f\"{s['slug']:26s} src {s['srcStartSec']:7.2f}-{s['srcEndSec']:7.2f} loop {s['loopSec']:6.2f}s seam[{s['seamQuietDb'][0]},{s['seamQuietDb'][1]}] fl {s['envFloorDb']}..{s['envP90Db']} gain {s['gainDb']:+.1f} lim {s['peakLimited']} rms {s['activeRmsDb']} K {s['kActiveDb']} tp {s['truePeakDb']} act {s['activeFrac']} | dec rms {d['activeRmsDb']} pk {d['peakDb']} head {d['headRmsDb']} tail {d['tailRmsDb']} seam {d['seamStepRatio']} n {d['samples']}/{s['m4a'].get('validFrames')} | band {b['p10']}/{b['p50']}/{b['p90']} pk {b['peakHz']} crest {b['medianCrestDb']} | {s['m4aBytes']//1024}KB\")"
done < $SP/tools/loops.tsv
