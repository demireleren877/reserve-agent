// Film boyunca kullanılan örnek rezerv verisi. Sayılar Actuarius demo
// ekranlarıyla (Motor / 2025Q4) tutarlıdır.

export const N = 10; // kaza yılı × gelişim periyodu
export const YEARS = Array.from({ length: N }, (_, i) => 2016 + i);

/** Kümülatif ödeme deseni (gelişim periyoduna göre). */
export const PATTERN = [0.42, 0.63, 0.76, 0.85, 0.91, 0.95, 0.975, 0.99, 0.997, 1.0];
/** Kaza yılı bazında nihai hasar (bin ₺). */
export const ULT = [300, 318, 326, 341, 352, 368, 391, 412, 446, 480];

export const cellHeight = (i: number, j: number) => 3.1 * PATTERN[j] * (ULT[i] / 480);
export const isKnown = (i: number, j: number) => i + j <= N - 1;

export const LDFS = ["1,2717", "1,1302", "1,0484", "1,0159"];
export const CDF = "1,5308";

export const TOTAL_ULT = 1836906;
export const TOTAL_IBNR = 241906;
export const ULR = 83.5;
