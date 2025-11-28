import dotenv from 'dotenv'; // Importa la librería dotenv
dotenv.config(); // Configura dotenv

export const URLS = {
  SIDOMURL: process.env.SIDOMURL,
  HOMEURL: 'https://uat.sidom.io/index.php/home'
};

export const CREDENCIALES = {
  USER: process.env.USER,
  PASS: process.env.PASS
};
