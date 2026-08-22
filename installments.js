// installments.js — Basit taksit hesaplayıcı.
//
// Sadece belirlenen satıcılarda (kredi kartı taksitini destekleyen)
// gösterilir. Peşin fiyatı eşit taksitlere böler — banka/kart bazlı
// vade farkı veya kampanya HESABA KATMAZ, çünkü bu oranlar sürekli
// değişiyor ve güvenilir şekilde takip edilemiyor. Bu nedenle burada
// gösterilen tutar her zaman matematiksel olarak doğru bir tahmindir
// ("peşin fiyat ÷ taksit sayısı"), gerçek kampanya tutarından farklı
// olabilir — kesin taksit tutarı için satıcı sitesi kontrol edilmeli.
//
// BDDK'nın kart taksit düzenlemesi (2022'den beri yürürlükte) telefon/
// elektronik cihaz kategorisinde taksit sayısını en fazla 6 ay ile
// sınırlıyor — bu yüzden 9 ve 12 ay gibi seçenekler burada GÖSTERİLMEZ,
// gerçekte var olmayan bir ödeme planı sunmuş oluruz.

const INSTALLMENT_SELLERS = new Set(['Amazon TR', 'Hepsiburada', 'Teknosa']);
const INSTALLMENT_MONTHS = [3, 6];

function getInstallmentOptions(price, sellerName) {
  if (!INSTALLMENT_SELLERS.has(sellerName)) return null;
  const numericPrice = Number(price);
  return INSTALLMENT_MONTHS.map(months => ({
    months,
    monthlyAmount: Math.round(numericPrice / months),
  }));
}

module.exports = { getInstallmentOptions, INSTALLMENT_SELLERS, INSTALLMENT_MONTHS };
