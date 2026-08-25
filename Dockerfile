FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy application source code
COPY . .

EXPOSE 3001

CMD ["node", "--max-old-space-size=384", "app.js"]
