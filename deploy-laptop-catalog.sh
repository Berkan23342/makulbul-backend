#!/bin/bash
# deploy-laptop-catalog.sh — Laptop kategorisi + katalogdaki tüm laptop
# ürünlerini/varyantlarını/zenginleştirmelerini, DATABASE_URL ortam
# değişkeninin gösterdiği veritabanına GERÇEK SIRAYLA ekler.
#
# Bu script 26 mevcut script'i (add-laptop-category.js, add-laptops*.js,
# add-laptop-variants*.js, enrich-laptop-specs*.js) TEK TEK, doğru bağımlılık
# sırasında çalıştırır — her biri kendi içinde BEGIN/COMMIT/ROLLBACK
# transaction'ı kullanıyor ve zaten var olan kayıtları "ATLA" diyerek
# atlıyor (idempotent), yani script'i yanlışlıkla iki kez çalıştırsanız
# bile veri ikilenmez.
#
# KULLANIM:
#   1) Production DATABASE_URL'inizi ortam değişkeni olarak ayarlayın:
#        export DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"
#        export DB_SSL=true
#   2) Bu proje klasöründen çalıştırın:
#        bash deploy-laptop-catalog.sh
#
# Herhangi bir script hata verirse (o script'in kendi ROLLBACK'i zaten
# devreye girer) bu wrapper HEMEN durur — sonraki script'ler çalışmaz,
# ekranda hangi script'te durduğunuzu görürsünüz. Sorunu çözüp script'i
# TEK BAŞINA tekrar çalıştırıp, sonra bu wrapper'ı kaldığı script'ten
# devam edecek şekilde (SCRIPTS listesinden öncekileri silip) yeniden
# çalıştırabilirsiniz.

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "HATA: DATABASE_URL ortam değişkeni ayarlanmamış."
  echo "Örnek: export DATABASE_URL=\"postgresql://...neon.tech/neondb?sslmode=require\""
  exit 1
fi

echo "=========================================="
echo "Laptop kataloğu dağıtımı başlıyor"
echo "Hedef veritabanı host'u: $(echo "$DATABASE_URL" | sed -E 's#.*@([^/]+)/.*#\1#')"
echo "=========================================="
echo ""
read -p "Yukarıdaki host DOĞRU mu (production Neon'unuz mu)? Devam etmek için 'evet' yazın: " CONFIRM
if [ "$CONFIRM" != "evet" ]; then
  echo "İptal edildi."
  exit 1
fi

SCRIPTS=(
  "add-laptop-category.js"
  "add-laptops.js"
  "add-laptops-round2.js"
  "add-laptops-round3.js"
  "add-laptops-round4.js"
  "add-laptops-round5.js"
  "add-laptops-round6.js"
  "add-laptops-round7.js"
  "add-laptops-round8.js"
  "add-laptops-round9.js"
  "add-laptops-round10.js"
  "add-laptop-variants.js"
  "add-laptop-variants-round2.js"
  "add-laptop-variants-round3.js"
  "add-laptop-variants-round4.js"
  "add-laptop-variants-round5.js"
  "enrich-laptop-specs.js"
  "enrich-laptop-specs-round2.js"
  "enrich-laptop-specs-round3.js"
  "enrich-laptop-specs-round4.js"
  "enrich-laptop-specs-round5.js"
  "enrich-laptop-specs-round6.js"
  "enrich-laptop-specs-round7.js"
  "enrich-laptop-specs-round8.js"
  "enrich-laptop-specs-round9.js"
  "enrich-laptop-specs-round10.js"
  "enrich-laptop-specs-round11.js"
  "enrich-laptop-specs-round12.js"
  "enrich-laptop-specs-round13.js"
  "enrich-laptop-specs-round14.js"
)

TOTAL=${#SCRIPTS[@]}
i=0
for script in "${SCRIPTS[@]}"; do
  i=$((i+1))
  echo ""
  echo "--- [$i/$TOTAL] $script ---"
  if [ ! -f "$script" ]; then
    echo "HATA: $script bulunamadı (bu klasörde çalıştırdığınızdan emin olun)."
    exit 1
  fi
  node "$script"
done

echo ""
echo "=========================================="
echo "✔ Tüm script'ler başarıyla tamamlandı ($TOTAL/$TOTAL)."
echo "=========================================="
