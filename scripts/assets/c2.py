import sys; sys.path.insert(0,'.')
from contrast import cr, hexs, inGamut
T={'ground':(0.19,0.014,150),'ground-raised':(0.23,0.014,150),'plate':(0.13,0.004,150),'ink':(0.955,0.008,95),'ink-2':(0.82,0.01,95),'ink-3':(0.70,0.012,95),'ink-4':(0.56,0.012,95),'on-chip':(0.18,0.015,60),'CR':(0.66,0.19,28)}
for k,v in T.items(): print(k,hexs(v))
for fg in ['ink','ink-2','ink-3','ink-4']:
  for bg in ['ground','ground-raised','plate']: print(fg,'on',bg,round(cr(T[fg],T[bg]),2))
print('plate vs ground', round(cr(T['plate'],T['ground']),2))
# max chroma
def maxc(L,h):
  lo,hi=0,0.4
  for _ in range(30):
    m=(lo+hi)/2
    if inGamut((L,m,h)): lo=m
    else: hi=m
  return lo
for L in (0.74,0.8,0.86):
  print(L, ' '.join(f"{h}:{maxc(L,h):.3f}" for h in range(0,360,30)))
