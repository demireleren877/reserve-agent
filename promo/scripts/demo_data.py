#!/usr/bin/env python3
"""Agent demo verisi: Fire Home, yıllık kaza dönemi × çeyreklik gelişim (sahte ama tutarlı).

Üçgeni, faktörleri, Q2/Q3 IBNR'ı ve köprü kalemlerini tek hesapta üretir ve
src/demo/data.json'a yazar. Büyük hasar (18,6m) AY2023'ün 2026Q3 diyagonaline eklidir.

Kullanım:  python3 scripts/demo_data.py
"""
import os
import json, math, random
random.seed(7)
AYS=list(range(2017,2027))
EP={2017:210,2018:245,2019:290,2020:360,2021:470,2022:760,2023:1250,2024:1720,2025:2180,2026:1890}
EP_Q2_2026=1260
LR={2017:.58,2018:.61,2019:.57,2020:.63,2021:.60,2022:.66,2023:.64,2024:.61,2025:.62,2026:.62}
# % reported (incurred) by quarterly dev 1..40, tail to 1.004 beyond
base=[.38,.62,.76,.85,.90,.93,.95,.965,.975,.982,.987,.991]
pat=base[:]
while len(pat)<40:
    last=pat[-1]; pat.append(last+(0.9961-last)*0.22)
TAIL=1/pat[38]  # factor beyond dev39 approx
def ndev(ay,q): # q: 2 or 3 (2026Q2 / Q3)
    return (2026-ay)*4+q
ULT={ay:EP[ay]*LR[ay] for ay in AYS}
inc={}
for ay in AYS:
    n=ndev(ay,3); row=[]
    v=ULT[ay]*pat[0]*(1+random.gauss(0,0.03))
    row.append(v)
    for d in range(2,n+1):
        f=pat[d-1]/pat[d-2]
        sd=0.012 if d<=4 else (0.0035 if d<=10 else 0.0012)
        f=max(1.0001,1+(f-1)*(1+random.gauss(0,0.35))+random.gauss(0,sd*0.3))
        row.append(row[-1]*f)
    inc[ay]=row
# AY2026 at Q2 uses lower earned; scale Q3 row
q2_2026=[v*EP_Q2_2026/EP[2026] for v in inc[2026][:2]]
LARGE=18.6
inc_l={ay:r[:] for ay,r in inc.items()}
inc_l[2023][14]+=LARGE   # dev15 (index14) of AY2023 = 2026Q3
def factors(tri,last_dev_map,cols=range(1,39),win=8):
    f={}
    for d in cols:
        pairs=[(ay,tri[ay][d-1],tri[ay][d]) for ay in AYS if len(tri[ay])>d]
        pairs=pairs[-win:] if pairs else []
        if pairs: f[d]=sum(p[2] for p in pairs)/sum(p[1] for p in pairs)
    return f
def ibnr(tri,ep26,cl_ays,bf_ays,lr=.62,tail=TAIL):
    f=factors(tri,None)
    tot=0;per={}
    for ay in AYS:
        row=tri[ay]; n=len(row); cdf=tail
        for d in range(n,39): cdf*=f.get(d,1.0)
        if ay in bf_ays:
            ep=ep26 if ay==2026 else EP[ay]
            u=row[-1]+ep*lr*(1-1/cdf)
        else:
            u=row[-1]*cdf
        per[ay]=(row[-1],u,u-row[-1],cdf); tot+=u-row[-1]
    return tot,per,f
q2={ay:(r[:-1] if ay!=2026 else q2_2026) for ay,r in inc.items()}
I2,p2,f2=ibnr(q2,EP_Q2_2026,None,[2025,2026])
I3,p3,f3=ibnr(inc,EP[2026],None,[2025,2026])
I3L,p3L,f3L=ibnr(inc_l,EP[2026],None,[2025,2026])
print("Q2 IBNR %.1f  Q3 clean %.1f  Q3 with large %.1f  diff %.1f"%(I2,I3,I3L,I3L-I3))
print("f14->15 clean %.4f with large %.4f"%(f3[15-1+0] if False else f3[14],f3L[14]))
# per-AY factor 14->15 for AY2023
r=inc_l[2023]; print("AY2023 14->15 with large %.4f clean %.4f"%(r[14]/r[13],inc[2023][14]/inc[2023][13]))
print("col avg 14->15 others", [round(inc[a][14]/inc[a][13],4) for a in AYS if len(inc[a])>14])
for ay in AYS: print(ay, len(inc[ay]), "inc %.1f ult %.1f ibnr %.1f cdf %.4f"%p3[ay])
# new exposure effect: BF on AY2026 extra earned
_,pq,_=ibnr({**q2},EP[2026],None,[2025,2026])
print("new exposure (2026 EP Q2->Q3 at Q2 maturity) %.1f"%(pq[2026][2]-p2[2026][2]))
OUT=os.path.join(os.path.dirname(__file__),"..","src","demo","data.json")
payload={"inc":{str(a):[round(v,2) for v in inc_l[a]] for a in AYS},"pat":pat,"I2":I2,"I3":I3,"I3L":I3L,"p3":{str(a):p3[a] for a in AYS},"f3":f3,"f3L":f3L}
# Köprü: yeni maruziyet (AY2026 Q3 kazanılan primi, BF) ve kalan = önceki dönemlerin gelişimi
cdf26=p3[2026][3]
payload["newexp"]=(EP[2026]-EP_Q2_2026)*.62*(1-1/cdf26)
payload["release"]=I3-I2-payload["newexp"]
json.dump(payload,open(OUT,"w"))
print("wrote",OUT)
