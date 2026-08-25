FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install --only=production

# Copy application source code
COPY . .

EXPOSE 3001

CMD ["node", "--max-old-space-size=384", "app.js"]
