FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Expose application port
EXPOSE 3000

RUN chmod -R 755 .

# Start application
CMD ["node", "server.js"]
