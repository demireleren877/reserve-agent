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

# ─── Rapor tarihi bazında değerleme ──────────────────────────────────────────
# Takvim çeyreği c: AY y'nin dev d hücresi c = (y-2017)*4 + d (2017Q1 = 1, 2026Q3 = 39).
EP_FULL=dict(EP); EP_FULL[2026]=EP[2026]*4/3   # 2026: 3 çeyrekte 1890 → yıllık 2520
def qlabel(c): return f"{2017+(c-1)//4}Q{(c-1)%4+1}"
def as_of(tri,c):
    out={}
    for ay in AYS:
        k=c-(ay-2017)*4
        if k>=1: out[ay]=tri[ay][:min(k,len(tri[ay]))]
    return out
def ep_at(c):
    return {ay:EP_FULL[ay]*min(1,(c-(ay-2017)*4)/4) for ay in AYS if c-(ay-2017)*4>=1}
def value(c,exclude=False):
    """c tarihindeki değerleme: CL tüm AY'ler, son AY için BF; ön LR = vw(Y-6:Y-2)."""
    lat=as_of(inc_l,c); fac=as_of(inc if exclude else inc_l,c); ep=ep_at(c)
    ays=sorted(lat); Y=ays[-1]
    f=factors_on(fac,ays); cd=cdfs_on(lat,f,ays)
    basis=[a for a in range(Y-6,Y-1) if a in lat]
    lr=sum(lat[a][-1]*cd[a] for a in basis)/sum(ep[a] for a in basis)
    rows={}
    for a in ays:
        l=lat[a][-1]; cl=l*cd[a]
        u=l+ep[a]*lr*(1-1/cd[a]) if a==Y else cl
        rows[a]=dict(latest=l,ep=ep[a],cdf=cd[a],cl=cl,pattern=cl/ep[a],ult=u,ibnr=u-l,bf=a==Y)
    tot=lambda k: sum(r[k] for r in rows.values())
    return dict(label=qlabel(c),ep=tot("ep"),inc=tot("latest"),ibnr=tot("ibnr"),ult=tot("ult"),lr=lr,basis=basis,rows=rows)
def factors_on(tri,ays,win=8):
    f={}
    for d in range(1,39):
        pairs=[(tri[a][d-1],tri[a][d]) for a in ays if a in tri and len(tri[a])>d][-win:]
        if pairs: f[d]=sum(y for x,y in pairs)/sum(x for x,y in pairs)
    return f
def cdfs_on(tri,f,ays,tail=TAIL):
    out={}
    for a in ays:
        c=tail
        for d in range(len(tri[a]),39): c*=f.get(d,1.0)
        out[a]=c
    return out

Q3=value(39,exclude=True)      # son hâl: aykırı hücre faktörlerden hariç
Q3L=value(39,exclude=False)    # hücre dahil olsaydı
Q2=value(38)
HIST=[value(c) for c in range(36,39)]+[Q3]   # 2025Q4 … 2026Q3
I3,I3L,I2=Q3["ibnr"],Q3L["ibnr"],Q2["ibnr"]
LR=Q3["lr"]; BASIS=Q3["basis"]
cdf26=Q3["rows"][2026]["cdf"]
newexp=(Q3["rows"][2026]["ep"]-Q2["rows"][2026]["ep"])*LR*(1-1/cdf26)
r=inc_l[2023]
print("LR %.4f basis %s"%(LR,BASIS))
print("I2 %.1f I3 %.1f I3L %.1f over %.1f newexp %.1f release %.1f"%(I2,I3,I3L,I3L-I3,newexp,I3-I2-newexp))
for h in HIST: print(h["label"],"EP %.0f inc %.1f ibnr %.1f ult %.1f ULR %.1f%%"%(h["ep"],h["inc"],h["ibnr"],h["ult"],100*h["ult"]/h["ep"]))
OUT=os.path.join(os.path.dirname(__file__),"..","src","demo","data.json")
payload={"inc":{str(a):[round(v,3) for v in inc_l[a]] for a in AYS},"incClean":{str(a):[round(v,3) for v in inc[a]] for a in AYS},
 "pat":pat,"I2":I2,"I3":I3,"I3L":I3L,"lr":LR,"basis":BASIS,"newexp":newexp,"release":I3-I2-newexp,
 "rows":{str(a):Q3["rows"][a] for a in AYS},
 "history":[{k:h[k] for k in ("label","ep","inc","ibnr","ult")} for h in HIST]}
json.dump(payload,open(OUT,"w"))
print("wrote",OUT)
