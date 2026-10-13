# בוט וואטסאפ AI — מוכן לשרת 24/7
FROM node:20-slim

# ffmpeg (הקלטות/חיתוך/קולות) + פייתון ו-yt-dlp (הורדת שירים)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

# auth_info ו-.env מגיעים מבחוץ (volume) — לא בתוך האימג'
VOLUME ["/app/auth_info"]

CMD ["node", "index.js"]
