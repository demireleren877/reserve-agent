import fs from 'node:fs';
import path from 'node:path';

// Finance Day için tamamen sentetik, tekrarlanabilir hasar hareketleri.
const outDir = path.dirname(new URL(import.meta.url).pathname);
const target = path.join(outDir, 'fire_home_2026Q2_synthetic.csv');
const rows = ['dosya_no,brans,hasar_tarihi,gelisim_tarihi,odeme,muallak'];
const quarterEnds = ['03-31', '06-30', '09-30', '12-31'];
const cases = [
  { year: 2018, claim: 7, age: 6, reserveUplift: 720000 },
  { year: 2021, claim: 3, age: 8, reserveUplift: 530000 },
];

for (let origin = 2007; origin <= 2026; origin++) {
  for (let claim = 1; claim <= 8; claim++) {
    const claimId = `FH-${origin}-${String(claim).padStart(3, '0')}`;
    const ultimate = 65000 + (origin - 2007) * 2500 + claim * 6100;
    const exceptional = cases.find((c) => c.year === origin && c.claim === claim);
    let previousPaid = 0;
    for (let year = origin; year <= 2026; year++) {
      for (let quarter = 1; quarter <= (year === 2026 ? 2 : 4); quarter++) {
        const age = (year - origin) * 4 + quarter;
        const paidToDate = Math.round(ultimate * (1 - Math.exp(-age / 8)) * 100) / 100;
        const payment = Math.round((paidToDate - previousPaid) * 100) / 100;
        previousPaid = paidToDate;
        const ordinaryReserve = ultimate * 0.9 * Math.exp(-age / 8);
        const uplift = exceptional && age >= exceptional.age ? exceptional.reserveUplift : 0;
        const reserve = Math.round((ordinaryReserve + uplift) * 100) / 100;
        rows.push(`${claimId},FIRE HOME,${origin}-02-15,${year}-${quarterEnds[quarter - 1]},${payment.toFixed(2)},${reserve.toFixed(2)}`);
      }
    }
  }
}

fs.writeFileSync(target, rows.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ path: target, claimCount: 20 * 8, recordCount: rows.length - 1, exceptions: cases }, null, 2));
