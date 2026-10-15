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
def factors(tri,win=8):
    f={}
    for d in range(1,39):
        pairs=[(tri[ay][d-1],tri[ay][d]) for ay in AYS if len(tri[ay])>d][-win:]
        if pairs: f[d]=sum(b for a,b in pairs)/sum(a for a,b in pairs)
    return f
def cdfs(tri,f,tail=TAIL):
    out={}
    for ay in AYS:
        c=tail
        for d in range(len(tri[ay]),39): c*=f.get(d,1.0)
        out[ay]=c
    return out
def project(latest_tri,fac_tri,ep,lr,bf_ays=(2026,)):
    """latest_tri: projeksiyonun uygulandığı son köşegen; fac_tri: faktörlerin hesaplandığı üçgen."""
    f=factors(fac_tri); c=cdfs(latest_tri,f); per={}; tot=0
    for ay in AYS:
        lat=latest_tri[ay][-1]
        cl=lat*c[ay]
        ult=lat+ep[ay]*lr*(1-1/c[ay]) if ay in bf_ays else cl
        per[ay]=dict(latest=lat,ep=ep[ay],cdf=c[ay],cl=cl,pattern=cl/ep[ay],ult=ult,ibnr=ult-lat,bf=ay in bf_ays)
        tot+=ult-lat
    return tot,per,f
def vw_lr(per,ays):
    return sum(per[a]["cl"] for a in ays)/sum(per[a]["ep"] for a in ays)

EP3=dict(EP); EP2=dict(EP); EP2[2026]=EP_Q2_2026
q2={ay:(r[:-1] if ay!=2026 else q2_2026) for ay,r in inc.items()}
BASIS=[2020,2021,2022,2023,2024]
# Q3: faktörler AY2023·14→15 hariç (temiz üçgen), projeksiyon gerçek köşegene (hasar dahil)
_,pre,_=project(inc_l,inc,EP3,0.62)
LR=vw_lr(pre,BASIS)
I3,p3,f3=project(inc_l,inc,EP3,LR)          # son hâl: hücre hariç
I3L,p3L,f3L=project(inc_l,inc_l,EP3,LR)     # hücre dahil olsaydı
_,pq2,_=project(q2,q2,EP2,0.62)
LR2=vw_lr(pq2,BASIS)
I2,p2,_=project(q2,q2,EP2,LR2)
newexp=(EP[2026]-EP_Q2_2026)*LR*(1-1/p3[2026]["cdf"])
r=inc_l[2023]
print("LR prior Q3 %.4f Q2 %.4f"%(LR,LR2))
print("I2 %.1f I3 %.1f I3L %.1f over %.1f newexp %.1f release %.1f"%(I2,I3,I3L,I3L-I3,newexp,I3-I2-newexp))
print("AY2023 14->15 with %.4f clean %.4f share %.0f%%"%(r[14]/r[13],inc[2023][14]/inc[2023][13],100*LARGE/(r[14]-r[13])))
print("VWA14 with %.4f clean %.4f"%(f3L[14],f3[14]))
for ay in AYS: print(ay,{k:(round(v,4) if isinstance(v,float) else v) for k,v in p3[ay].items()})
OUT=os.path.join(os.path.dirname(__file__),"..","src","demo","data.json")
payload={"inc":{str(a):[round(v,3) for v in inc_l[a]] for a in AYS},"incClean":{str(a):[round(v,3) for v in inc[a]] for a in AYS},
 "pat":pat,"I2":I2,"I3":I3,"I3L":I3L,"lr":LR,"basis":BASIS,"newexp":newexp,"release":I3-I2-newexp,
 "rows":{str(a):p3[a] for a in AYS}}
json.dump(payload,open(OUT,"w"))
print("wrote",OUT)
