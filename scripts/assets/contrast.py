import math
def oklch_to_srgb(L,C,H):
    h=math.radians(H); a=C*math.cos(h); b=C*math.sin(h)
    l_=L+0.3963377774*a+0.2158037573*b
    m_=L-0.1055613458*a-0.0638541728*b
    s_=L-0.0894841775*a-1.2914855480*b
    l,m,s=l_**3,m_**3,s_**3
    r= 4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return (r,g,bb)
def lum(c):
    r,g,b=[min(1,max(0,x)) for x in oklch_to_srgb(*c)]
    return 0.2126*r+0.7152*g+0.0722*b
def inGamut(c):
    return all(-0.001<=x<=1.001 for x in oklch_to_srgb(*c))
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def hexs(c):
    r,g,b=[min(1,max(0,x)) for x in oklch_to_srgb(*c)]
    f=lambda x: round(255*(12.92*x if x<=0.0031308 else 1.055*x**(1/2.4)-0.055))
    return '#%02x%02x%02x'%(f(r),f(g),f(b))
T={
 'ground':(0.17,0.014,150),'ground-raised':(0.205,0.014,150),'stage':(0.135,0.01,150),
 'ink':(0.955,0.008,95),'ink-2':(0.82,0.01,95),'ink-3':(0.68,0.012,95),'ink-4':(0.56,0.012,95),
 'accent-min':(0.74,0.12,145),'accent-min-red':(0.74,0.14,30),'accent-min-blue':(0.74,0.12,250),
 'on-chip':(0.18,0.015,60),
 'LC':(0.74,0.15,145),'NT':(0.84,0.15,120),'VU':(0.87,0.16,98),'EN':(0.75,0.15,55),'CR':(0.66,0.19,28),'EW':(0.62,0.11,330),'EX':(0.82,0.0,0),'DD':(0.78,0.01,95),
 'scrim-dark':(0.14,0.01,150),
}
for k,v in T.items(): print(f"{k:16s} {hexs(v)} gamut={inGamut(v)}")
print()
for fg in ['ink','ink-2','ink-3','ink-4','accent-min','accent-min-red','accent-min-blue']:
    for bg in ['ground','ground-raised','stage']:
        print(f"{fg:16s} on {bg:14s} {cr(T[fg],T[bg]):.2f}")
print()
for s in ['LC','NT','VU','EN','CR','EW','EX','DD']:
    print(f"on-chip on {s}: {cr(T['on-chip'],T[s]):.2f} ; {s} vs ground (non-text 3:1): {cr(T[s],T['ground']):.2f}")
