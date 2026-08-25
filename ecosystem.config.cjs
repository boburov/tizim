// PM2 ecosystem — tizim-api (asosiy NestJS) va admin-api (admin NestJS).
//
// NEGA KERAK: cutover'gacha `tizim-api` pm2 jarayoni Express'ning
// `server/src/index.js` fayliga bog'langan edi. NestJS'ga o'tilганda o'sha
// fayl o'chirildi, ammo pm2 hali ham eski yo'lni saqlаб turardi va
// `pm2 restart` uni yangilamasdi. Bu fayl HAR IKKALA app uchun to'g'ri
// `script` (dist/main.js) va `cwd`ni YAGONA manbada belgilaydi; deploy.sh
// `pm2 startOrReload` bilan shu yo'lni majburiy qo'llaydi.
//
// Muhit o'zgaruvchilari (PORT, NEST_PORT, DATABASE_URL, ...) har app'ning
// o'z papkasidagi `.env`dan NestJS ConfigModule orqali o'qiladi — shu bois
// bu yerda takrorlanmaydi (yagona haqiqat manbai — `.env`).

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'tizim-api',
      cwd: path.join(__dirname, 'server'),
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'admin-api',
      cwd: path.join(__dirname, 'admin_server'),
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: 'production' },
    },
  ],
};
