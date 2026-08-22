// run-sql.js — Bir .sql dosyasını doğrudan veritabanına çalıştırır.
// pgAdmin'e kopyala-yapıştır yapmana gerek bırakmaz.
//
// Kullanım:
//   node run-sql.js dosya-adi.sql
//
// .env dosyandaki DATABASE_URL'i kullanır (backend'in kullandığı bağlantı).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const fileArg = process.argv[2];
if (!fileArg) {
  console.error('Kullanım: node run-sql.js dosya-adi.sql');
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`Dosya bulunamadı: ${filePath}`);
  console.error('Bu script ile aynı klasörde olduğundan emin ol.');
  process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf8');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  console.log(`"${fileArg}" çalıştırılıyor...`);
  try {
    await pool.query(sql);
    console.log('✔ Başarılı — SQL çalıştı.');
  } catch (err) {
    console.error('✘ Hata:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
