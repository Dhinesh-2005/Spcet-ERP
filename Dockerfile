# ==========================================
# STAGE 1: Build the React Frontend
# ==========================================
FROM node:18 AS frontend-build
WORKDIR /app/frontend

# Copy frontend files and install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy the rest of the frontend code and build it
COPY frontend/ ./
RUN npm run build

# ==========================================
# STAGE 2: Build the Spring Boot Backend
# ==========================================
FROM maven:3.8.5-openjdk-17 AS backend-build
WORKDIR /app/backend

# Copy backend source code
COPY backend/ ./

# THE MAGIC TRICK: Copy the compiled React app directly into Spring Boot's static folder
COPY --from=frontend-build /app/frontend/dist/ ./src/main/resources/static/

# Package the Java app (skipping tests for speed)
RUN mvn clean package -DskipTests

# ==========================================
# STAGE 3: Run the Application (Render Optimized)
# ==========================================
FROM openjdk:17.0.1-jdk-slim
WORKDIR /app

# CRITICAL: Force Spring Boot to listen to Render's Port and public internet address
ENV SERVER_PORT=${PORT:-8080}
ENV SERVER_ADDRESS=0.0.0.0

# CRITICAL: Limit Java memory to 400MB so Render's 512MB Free Tier NEVER crashes again
ENV JAVA_TOOL_OPTIONS="-Xmx400m -Xms256m"

# Copy the final compiled JAR from Stage 2
COPY --from=backend-build /app/backend/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]