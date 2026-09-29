import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
const root='/Users/erendemirel/projects/reserve-agent';
const skill='/Users/erendemirel/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations';
const python='/Users/erendemirel/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const out=path.join(root,'deliverables/finance-day/Finance_Day_Uctan_Uca_AI.pptx');
const p=Presentation.create({slideSize:{width:1280,height:720}});
const c={bg:'#F8F9F6',ink:'#1F3434',muted:'#526766',teal:'#286C63',sage:'#DDEAE2',light:'#EDF2EE',line:'#C6D4CE',sand:'#F1E7D8',rust:'#926443',blue:'#DFE9EE'};
const font='Arial';
const talks=[];
function tx(s,t,x,y,w,h,size=26,color=c.ink,bold=false){const a=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});a.text=t;a.text.style={typeface:font,fontSize:size,color,bold,autoFit:'none',wrap:'square',insets:{top:0,bottom:0,left:0,right:0}};return a;}
function box(s,x,y,w,h,fill=c.light){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:'none',width:0}});}
function line(s,x,y,w,col=c.line){return s.shapes.add({geometry:'line',position:{left:x,top:y,width:w,height:0},fill:'none',line:{fill:col,width:1}});}
function arrow(s,a,b){s.shapes.connect(a,b,{kind:'straight',fromSide:'right',toSide:'left',line:{fill:c.teal,width:2},tail:{type:'triangle',width:'sm',length:'sm'}});}
function slide(title,note,options={}){const s=p.slides.add();s.background.fill=options.bg||c.bg;const n=p.slides.items.length; if(title)tx(s,title,72,65,1136,112,44,c.ink,true);tx(s,'Finance Day  /  Actuarius',72,677,800,18,13,c.muted);tx(s,String(n).padStart(2,'0'),1166,677,42,18,13,c.muted);if(options.status)tx(s,options.status,72,633,1100,24,16,c.muted);s.speakerNotes.textFrame.setText(note);talks.push({n,title,note});return s;}
function row(s,y,num,title,desc){tx(s,num,72,y,60,42,24,c.teal,true);tx(s,title,160,y-3,375,55,30,c.ink,true);tx(s,desc,585,y,590,72,24,c.muted);line(s,160,y+89,1015);}
function flow(s,labels,y=300,h=115){const gap=22,w=(1136-gap*(labels.length-1))/labels.length;const nodes=labels.map((l,i)=>{const x=72+i*(w+gap);const a=box(s,x,y,w,h,i%2?c.light:c.sage);tx(s,String(i+1).padStart(2,'0'),x+16,y+15,w-32,24,17,c.teal,true);tx(s,l,x+16,y+53,w-32,h-55,25,c.ink,true);return a;});for(let i=0;i<nodes.length-1;i++)arrow(s,nodes[i],nodes[i+1]);return nodes;}

// 1. Opening promise
{
const s=slide('',`Süre: 45 saniye.\nBir dönem kapanışını düşünelim. Önce veriyi topluyoruz, ardından kontrolleri çalıştırıyor, mizanla mutabakat kuruyor, analizleri hazırlıyor ve modellere geçiyoruz. Her adım değerli, ancak adımlar arasındaki aktarım da ciddi dikkat istiyor. Actuarius fikri bu akışı tek bir çalışma ortamında birleştirme ihtiyacından doğuyor. Bugün çalışan temeli ve agent ile yönetilebilir uçtan uca süreç vizyonumuzu paylaşacağım.`);
tx(s,'Aktüeryal iş akışında yapay zekâ',72,82,900,35,22,c.teal,true);
tx(s,'Veriden karara,\ntek çalışma ortamı',72,204,1120,170,68,c.ink,true);
tx(s,'Veri, kontroller, analiz ve modelleri\nagent ile yönetilen bir sürece bağlamak',76,437,1050,100,32,c.muted);
tx(s,'Actuarius Enterprise',76,579,850,42,26,c.teal,true);
}
// 2. Why it emerged
{
const s=slide('Projenin çıkış noktası',`Süre: 65 saniye.\nProjenin çıkış noktası tek bir hesaplama ihtiyacı değildi. Analize geçmeden önce veriyi hazırlama, kontrol sonuçlarını toplama ve doğru sürümü bulma ihtiyacı vardı. Bu işleri farklı yerlerde yürüttüğümüzde aradaki bağı ekip hafızası koruyor. Hedefimiz bu bağı sistemin koruması. Buradaki mevcut süreç çizimi operasyonel bir hipotezdir, ölçülmüş bir şirket zaman etüdü değildir.`);
tx(s,'Analizin öncesinde ve arasında\nne kadar iş yapıyoruz?',72,192,1100,120,50,c.teal,true);
flow(s,['Veriyi\ntopla','Kontrolü\ntekrarla','Raporu\nçalıştır','Modele\naktar','Farkı\naçıkla'],363,149);
tx(s,'Her aktarım, bağlamı ve doğru sürümü koruma ihtiyacı doğuruyor.',72,557,1110,65,28,c.muted);
}
// 3. Why executives care
{
const s=slide('Dağınık süreçlerin görünmeyen maliyeti',`Süre: 60 saniye.\nBu maliyeti yalnızca dakika olarak düşünmemeliyiz. Aynı kontrolün yeniden yapılması, farklı analizlerde farklı filtre kullanılması ve bir model sonucunun kaynağını tekrar araştırmak zorunda kalmak da maliyet. Zaman, tutarlılık ve erişim birbirine bağlı. Tek ortam yaklaşımı bu üç ihtiyacı aynı süreç üzerinde karşılamayı hedefliyor.`);
row(s,220,'01','Uzman zamanı','Tekrarlı hazırlık ve aktarım işleri analize ayrılan zamanı daraltıyor.');
row(s,349,'02','Analiz tutarlılığı','Farklı dosya ve filtreler sonuçları karşılaştırmayı zorlaştırabiliyor.');
row(s,478,'03','Veri–model ilişkisi','Bir sonuçtan kaynak veriye dönmek ek araştırma gerektiriyor.');
}
// 4. Full end-to-end proposition
{
const s=slide('Uçtan uca tek bir iş akışı',`Süre: 80 saniye.\nÖnerdiğimiz kapsam verinin alınmasıyla başlıyor. Veri kalitesi kontrolleri, mizan mutabakatı ve gerekli analiz raporları modelleme öncesindeki adımları oluşturuyor. Modelleme ve sonuç açıklaması aynı dönem bağlamında devam ediyor. Agent bu sürecin erişim ve yönlendirme katmanı. Bu çizim hedef kapsamdır. Mevcut üründe veri, modelleme, nakit akışı ve iskonto temeli var. Otomatik mizan mutabakatı ve bütün adımları yöneten orkestrasyon geliştirme kapsamıdır.\nKaynak: enterprise-v2/README.md, enterprise-v2/KULLANIM_KILAVUZU.md, enterprise-v2/backend/app/agent/tools.py.`,{status:'Hedef süreç: mevcut ürün temeli üzerine kurulacak uçtan uca otomasyon'});
flow(s,['Veri\nalımı','Veri\nkalitesi','Mizan\nmutabakatı','Analiz\nraporları','Model\noluşturma','Sonuç ve\naçıklama'],232,165);
line(s,72,453,1136,c.teal);
tx(s,'AGENT',72,480,200,42,27,c.teal,true);
tx(s,'Süreci başlatır, durumunu takip eder, istisnaları uzmana taşır',286,482,920,86,30,c.ink,true);
}
// 5. Data lineage
{
const s=slide('Veri ve model aynı bağlamı paylaşır',`Süre: 75 saniye.\nBir modeli yalnızca sonucuyla saklamak yeterli değil. Hangi veri sürümünü kullandı, hangi kontrollerden geçti, hangi varsayım setiyle üretildi ve hangi rapora girdi? Hedefimiz bu bağı modelden kaynağa kadar korumak. Böylece bir veri düzeltmesinin etkilediği analiz ve modelleri de görebiliriz. Tam veri soy ağacı hedef tasarımdır. Mevcut dönem ve proje yapısı bunun başlangıç noktasıdır.\nKaynak: enterprise-v2/frontend/src/lib/project-store.tsx.`,{status:'Hedef tasarım: veri sürümü, kontrol sonucu ve model bağlantısını kalıcılaştırma'});
tx(s,'Bir sonucun arkasındaki zincir',72,182,1100,52,31,c.muted);
flow(s,['Kaynak\nveri','Kontrol\nsonucu','Varsayım\nseti','Model\nsürümü','Yönetim\nçıktısı'],297,155);
tx(s,'“Bu sonuç nereden geldi?”',72,510,900,55,42,c.teal,true);
tx(s,'Aynı dönem ve branş bağlamında izlenebilir yanıt',72,575,1060,40,26,c.muted);
}
// 6. DQ detail
{
const s=slide('Veri kalitesi sürecin ilk kontrol kapısı',`Süre: 65 saniye.\nEksik tarih, mükerrer kayıt, beklenmeyen tutar veya dönem uyumsuzluğu modelin içinde keşfedilmemeli. Hedef süreçte kuralları veri girişinde çalıştırıyoruz. Kurallar ölçülebilir ve tekrar üretilebilir olmalı. Agent kontrol sonucunu özetleyebilir ve uzmanı sorunlu kayıtlara yönlendirebilir. Kritik hatada akışı durdurma ve istisna sahibine yönlendirme hedef kontrol davranışlarıdır.` ,{status:'Önerilen otomasyon: kurala dayalı kontroller ve agent destekli istisna incelemesi'});
row(s,214,'01','Alan ve kayıt kontrolleri','Eksik alan, mükerrer kayıt, tarih ve tutar uyumsuzlukları');
row(s,343,'02','Dönem karşılaştırması','Hacim, toplam ve dağılımdaki beklenmeyen değişimler');
row(s,472,'03','İstisna yönetimi','Kritik bulguda duraklama, sorumlu atama ve düzeltme kaydı');
}
// 7. Mizan
{
const s=slide('Mizan mutabakatı analize bağlanır',`Süre: 70 saniye.\nMizan kontrolünü ayrı bir dosyada yapılan son kontrol olarak bırakmak istemiyoruz. Aktüeryal veri toplamlarını ilgili muhasebe hesaplarıyla aynı dönem, para birimi ve kapsamda karşılaştırmayı planlıyoruz. Hesap eşlemesi ve toleranslar finans ile birlikte tanımlanmalı. Fark olduğunda agent farkı gizlemez, ilgili kalemleri inceleme listesine taşır. Mutabakat sağlanmadan veya yetkili istisna onayı olmadan sonraki aşamaya geçilmemesi hedeflenir. Bu modül mevcut üründe tamamlanmış değildir.`,{status:'Planlanan modül: hesap eşlemeleri, kapsam ve toleranslar Finans ile tanımlanacak'});
const a=box(s,72,234,425,133,c.sage);tx(s,'Aktüeryal veri toplamı',100,277,370,60,30,c.ink,true);
const b=box(s,783,234,425,133,c.blue);tx(s,'İlgili mizan hesapları',811,277,370,60,30,c.ink,true);
tx(s,'MUTABAKAT',527,280,230,43,22,c.teal,true);line(s,497,302,28,c.teal);line(s,749,302,34,c.teal);
tx(s,'Aynı dönem · Aynı kapsam · Aynı para birimi',72,411,1090,48,29,c.muted);
tx(s,'Fark varsa inceleme. Uygunsa analize geçiş.',72,514,1090,75,36,c.teal,true);
}
// 8. Reports and models
{
const s=slide('Raporlar modellerin hazırlık adımı olur',`Süre: 65 saniye.\nGerekli raporları her seferinde yeniden tarif etmek yerine dönem ve branşa bağlı analiz setleri tanımlamayı öneriyoruz. Hasar gelişimi, büyük hasar incelemesi, dönemsel değişim ve gerçekleşen–beklenen karşılaştırmaları model seçimlerine bağlanır. Bu yaklaşım varsayımların dayanağını görünür kılar. Mevcut ürün bu analizlerin bir kısmını içeriyor. Otomatik sıralama, bağımlılık yönetimi ve kontrol kapıları geliştirme kapsamıdır.\nKaynak: enterprise-v2/KULLANIM_KILAVUZU.md ve enterprise-v2/frontend/src/app/reserve/page.tsx.`,{status:'Mevcut analiz yetenekleri üzerine önerilen otomatik çalışma sırası'});
tx(s,'Standart analiz seti',72,216,480,53,34,c.teal,true);
tx(s,'Hasar gelişimi\nBüyük hasar incelemesi\nDönemsel değişim\nGerçekleşen–beklenen',72,300,480,230,30,c.ink);
tx(s,'Model çalışma alanı',680,216,530,53,34,c.teal,true);
tx(s,'Gelişim faktörü seçimi\nYöntem karşılaştırması\nVarsayım ve senaryolar\nRezerv, nakit akışı ve iskonto',680,300,530,230,30,c.ink);
line(s,72,569,1136);tx(s,'Her model seçimi ilgili analiz ve veri sürümüyle ilişkilendirilir.',72,588,1110,40,25,c.muted);
}
// 9. Agent hero prompt
{
const s=slide('Agent, sürecin ortak erişim noktası',`Süre: 70 saniye.\nAgent ile kurulacak ilişkiyi bir komut örneğiyle anlatalım. Kullanıcı dönem ve branşı söyleyip bir çalışma başlatmak istiyor. Agent kapsamı netleştirir, gerekli fonksiyonları çağırır ve kontrol sonuçlarını sunar. Kullanıcı her alt ekranı tek tek aramak yerine aynı çalışma bağlamında ilerler. Buradaki cümle hedef etkileşim örneğidir, bugün bu uçtan uca komutun eksiksiz çalıştığı iddiası değildir.`,{status:'Hedef etkileşim örneği'});
tx(s,'“Motor branşının dönem verisini hazırla.\nKalite ve mizan kontrollerini çalıştır.\nSorun yoksa analizleri ve modeli oluştur.”',72,211,1125,250,44,c.teal,true);
tx(s,'Tek talep',72,529,280,50,35,c.ink,true);
tx(s,'Bağlantılı işlemler ve görünür kontrol noktaları',390,535,810,80,30,c.muted);
}
// 10. Narrative scenario
{
const s=slide('Bir dönem kapanışının hedef akışı',`Süre: 90 saniye.\nŞimdi komutun arkasında nasıl bir süreç görmek istediğimizi anlatalım. İlk olarak agent veri alımını başlatır ve kalite sonuçlarını toplar. İkinci aşamada mizan farkı bulduğunu varsayalım. Akış durur ve aktüer ile finans sorumlusuna inceleme sunar. Düzeltme ya da yetkili istisna onayından sonra raporlar çalışır ve model taslağı hazırlanır. Son adımda aktüer varsayımı ve sonucu değerlendirir. Buradaki gösterim canlı demo değildir, önerilen süreç senaryosudur.`,{status:'Kavramsal senaryo: otomasyon akışı ve insan müdahalesi'});
row(s,205,'01','Talep ve hazırlık','Agent dönem kapsamını alır, veriyi ve kontrolleri hazırlar.');
row(s,334,'02','Fark ve müdahale','Mizan farkında süreç durur. Uzman farkı çözer veya gerekçeli istisnayı onaylar.');
row(s,463,'03','Model ve değerlendirme','Raporlar ve model taslağı oluşur. Aktüer varsayımı ve sonucu değerlendirir.');
}
// 11. Access superior
{
const s=slide('Modele erişim, soruyla başlar',`Süre: 60 saniye.\nAgent’ın ikinci değeri süreci başlatmanın ötesinde modele erişim. Yönetici ya da aktüer belirli bir soruyu sorduğunda dönem, branş, model ve veri bağlamını birlikte kullanmasını istiyoruz. Veri–model ilişkisi güçlü olduğunda açıklama da güçlenir. AI açıklaması kaynak sonuçlarla kontrol edilmeli, belirsizlik varsa açıkça belirtilmeli.\nKaynak: enterprise-v2/backend/app/agent/tools.py.`,{status:'Örnek sorular: yetkili veri ve model kapsamına bağlı agent desteği'});
tx(s,'“Rezerv değişimini hangi dönemler açıklıyor?”',72,220,1110,70,36,c.teal,true);
tx(s,'“Bu varsayımı değiştirirsek sonuç nasıl etkilenir?”',72,332,1110,90,36,c.teal,true);
tx(s,'“Kaynak veriye ve kontrol sonucuna dönebilir miyim?”',72,461,1110,95,36,c.teal,true);
}
// 12. Benefit
{
const s=slide('Beklediğimiz değer',`Süre: 65 saniye.\nİlk kazanım tekrarlı işlerin azalması. İkinci kazanım aynı veri ve kontrol tanımlarının kullanılmasıyla daha tutarlı analiz. Üçüncü kazanım model sonucuna erişimin ve araştırmanın kolaylaşması. Bunları gerçekleşmiş sonuçlar olarak sunmuyoruz. Pilotla ölçeceğimiz fayda hipotezleri olarak tanımlıyoruz. Aktüerin zamanı arttığında daha fazla senaryoya, varsayım incelemesine ve karar desteğine ayrılabilir.`,{status:'Beklenen faydalar: gerçekleşen etki pilot ölçümüyle doğrulanacak'});
row(s,211,'01','Zaman kazanımı','Tekrarlı veri hazırlığı, rapor çalıştırma ve aktarımın azalması');
row(s,340,'02','Daha tutarlı analiz','Ortak veri sürümü, kontrol seti ve yöntem tanımları');
row(s,469,'03','Daha güçlü karar desteği','Modele hızlı erişim ve sonucun dayanağına geri dönüş');
}
// 13 metrics no fake
{
const s=slide('Başarıyı iş akışında ölçeceğiz',`Süre: 60 saniye.\nZaman kazanımı iddiasını aynı kapsamda karşılaştırmalıyız. Bir kapanışta veri hazırlığından değerlendirmeye kadar geçen süreyi ve uzman dokunuşunu ölçebiliriz. Yeniden çalışma sayısı tutarlılık için, kaynak ve kontrol bağlantısı tamamlanmış modellerin oranı izlenebilirlik için yardımcı göstergelerdir. Henüz başlangıç verisi olmadığı için yüzde kazanç vermiyoruz. Hedefleri baz ölçümden sonra belirleyebiliriz.`,{status:'Ölçüm tasarımı: hedef yüzdeler başlangıç değerleri toplandıktan sonra belirlenecek'});
const labs=[['Süre','Veriden model\ndeğerlendirmesine'],['Tekrar','Manuel işlem ve\nyeniden çalışma'],['İz','Kaynağa bağlı\nmodel oranı']];
labs.forEach((a,i)=>{const x=72+i*387;tx(s,a[0],x,249,345,100,64,c.teal,true);tx(s,a[1],x,380,340,90,29,c.ink);});
line(s,72,531,1136);tx(s,'Aynı branş, aynı dönem kapsamı, karşılaştırılabilir çıktı',72,566,1120,60,29,c.muted);
}
// 14 guardrails compact
{
const s=slide('Uzmanlık ve kontrol sürecin içinde kalır',`Süre: 65 saniye.\nUçtan uca otomasyon kurarken karar yetkisini açık tutuyoruz. Kontrol kuralları ve hesap fonksiyonları tekrar üretilebilir olmalı. Agent bu fonksiyonları çağırır, çıktıları birleştirir ve istisnaları sunar. Aktüer varsayım ve nihai değerlendirmeden sorumlu kalır. Kurum içi veya dışı AI kullanımı veri politikası ve yetki kapsamıyla belirlenir. Bu slayt hedef işletim modelidir. Tam yetki matrisi, değiştirilemez kayıt ve kurumsal secret yönetimi uygulama öncesi tamamlanacak kontrol ihtiyaçlarıdır.`,{status:'Hedef işletim modeli: erişim, veri politikası ve işlem kayıtlarıyla desteklenecek'});
flow(s,['Kurallar ve\nhesap motoru','Agent ile\niş akışı','Aktüer\ndeğerlendirmesi'],248,160);
tx(s,'Tekrar üretilebilir hesap',72,462,345,75,28,c.muted);
tx(s,'Görünür işlem ve istisna',458,462,345,75,28,c.muted);
tx(s,'Açık karar sorumluluğu',844,462,345,75,28,c.muted);
}
// 15 status clear
{
const s=slide('Çalışan temel, genişleyen süreç',`Süre: 80 saniye.\nBugün elimizde veri yönetimi, rezerv modelleri, nakit akışı ve iskonto modülleri ile agent araç entegrasyonu içeren çalışan bir ürün temeli var. Şirket içinde tarif ettiğimiz uçtan uca sürece ulaşmak için standart veri kalite paketleri, mizan mutabakatı, rapor bağımlılıkları ve süreç orkestrasyonunu eklemeyi öneriyoruz. Kurumsal kontrol katmanı da bu kapsamla birlikte tamamlanmalı. Mevcut özelliği ve hedefi ayırmak, çalışmanın güvenilirliğini artırır.\nKaynaklar: enterprise-v2/README.md, enterprise-v2/KULLANIM_KILAVUZU.md, enterprise-v2/backend/app/agent/tools.py. İnceleme tarihi: 8 Eylül 2026.`);
tx(s,'Mevcut ürün temeli',72,206,540,52,33,c.teal,true);
tx(s,'Veri ve dönem yönetimi\nRezerv modelleme\nNakit akışı ve iskonto\nAgent araç entegrasyonu',72,302,520,225,29,c.ink);
tx(s,'Uçtan uca geliştirme kapsamı',675,206,533,90,33,c.rust,true);
tx(s,'Standart kalite kontrol paketleri\nMizan mutabakatı\nRapor ve model orkestrasyonu\nKurumsal yetki ve onay akışı',675,302,533,225,29,c.ink);
line(s,72,568,1136);tx(s,'Önerilen ilk uygulama: tek branşta, mevcut kapanışla paralel çalışma',72,594,1120,40,25,c.muted);
}
// 16 wider finance and close
{
const s=slide('Finans için öğrenme alanı',`Süre: 60 saniye.\nAktüeryada bu yaklaşımı geliştirmek, finansın diğer alanları için de aktarılabilir bir çalışma biçimi oluşturabilir. Ortak yapı veri, kontrol, analiz ve karar. İleride mutabakat, yönetim raporlaması veya bütçe senaryolarında benzer prensipler değerlendirilebilir. Bunları mevcut ürün kapsamı veya onaylanmış yol haritası olarak değil, aktüerya çalışmasından öğrenme fırsatları olarak düşünmeliyiz.`,{status:'Gelecek kullanım fırsatları: kapsam ve uygunluk ayrı değerlendirilecek'});
tx(s,'Veri + Kontrol + Analiz + Karar',72,238,1120,90,51,c.teal,true);
tx(s,'Mutabakat süreçleri',72,430,350,80,31,c.ink,true);
tx(s,'Yönetim raporlaması',460,430,350,80,31,c.ink,true);
tx(s,'Bütçe ve senaryolar',848,430,350,80,31,c.ink,true);
tx(s,'Aktüeryadaki deneyim, benzer finans iş akışlarına yön verebilir.',72,558,1110,68,29,c.muted);
}
// 17 close
{
const s=slide('',`Süre: 45 saniye.\nBaşlangıç sorumuza dönelim. Aktüerin zamanını veri ve dosyalar arasındaki bağı korumaya mı, sonuçları değerlendirmeye mi ayırmasını istiyoruz? Actuarius ile veri, kontrol ve modelleri tek çalışma ortamında bağlamayı hedefliyoruz. Agent bu akışa erişimi kolaylaştırıyor. Önümüzdeki adım, şirket sürecini tek branş üzerinde birlikte tanımlamak ve faydayı gerçek kapanış verisiyle ölçmek. Sorularınızı ve hangi akışta başlamamız gerektiğine dair görüşlerinizi almak isterim.`);
tx(s,'Actuarius',72,104,1000,50,30,c.teal,true);
tx(s,'Daha az aktarım.\nDaha fazla analiz.',72,236,1120,175,68,c.ink,true);
tx(s,'Veriden modele uzanan bağı güçlendiren,\nagent ile yönetilebilen bir çalışma ortamı',72,463,1100,110,33,c.muted);
}

await fs.mkdir(path.dirname(out),{recursive:true});
const candidate=path.join(root,'.codex-finalizer/end-to-end-candidate.pptx');
await(await PresentationFile.exportPptx(p)).save(candidate);
await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:out,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],explicitTotalSlideCount:17,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(root,'.codex-finalizer/end-to-end-validation.json')});
await fs.writeFile(path.join(root,'.codex-build/finance-day/storyline-notes.json'),JSON.stringify(talks,null,2));
console.log(out);
