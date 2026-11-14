# 构建需要访问 npm、Maven Central 和 Docker 镜像仓库。
FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci --no-audit --no-fund
COPY frontend/ frontend/
RUN npm run build --workspace frontend

FROM maven:3.9.12-eclipse-temurin-21 AS backend
WORKDIR /build
COPY backend/pom.xml backend/pom.xml
COPY backend/src/main/ backend/src/main/
COPY --from=frontend /build/frontend/dist/ frontend/dist/
RUN mvn -B -f backend/pom.xml package -Dmaven.test.skip=true

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system aihot && useradd --system --gid aihot aihot && mkdir data && chown aihot:aihot data
COPY --from=backend /build/backend/target/aihot-1.0.0.jar /app/aihot.jar
USER aihot
ENV BIND_ADDRESS=0.0.0.0
ENV JAVA_TOOL_OPTIONS="-Xms128m -Xmx512m"
EXPOSE 8787
ENTRYPOINT ["java","-jar","/app/aihot.jar"]
