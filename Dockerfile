# Use an official Node.js runtime as a parent image
# Using a slim version to keep the image size down
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install app dependencies
RUN npm install

# Bundle app source
COPY . .

# Your app binds to port 3000, so expose it
EXPOSE 3000

# Define the command to run your app
CMD [ "node", "server.js" ]