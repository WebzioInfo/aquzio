# Multi-stage Dockerfile for ASP.NET Core API Deployment on Render

# Stage 1: Build & Publish
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution and project files for dependency restore caching
COPY Aquora.slnx ./
COPY src/Aquora.Domain/Aquora.Domain.csproj src/Aquora.Domain/
COPY src/Aquora.Application/Aquora.Application.csproj src/Aquora.Application/
COPY src/Aquora.Infrastructure/Aquora.Infrastructure.csproj src/Aquora.Infrastructure/
COPY src/Aquora.Persistence/Aquora.Persistence.csproj src/Aquora.Persistence/
COPY src/Aquora.Shared/Aquora.Shared.csproj src/Aquora.Shared/
COPY src/Aquora.API/Aquora.API.csproj src/Aquora.API/
COPY src/Aquora.Tests/Aquora.Tests.csproj src/Aquora.Tests/

# Restore dependencies
RUN dotnet restore Aquora.slnx

# Copy the rest of the backend source code
COPY . ./

# Build and Publish in Release configuration
WORKDIR /src/src/Aquora.API
RUN dotnet build Aquora.API.csproj -c Release --no-restore
RUN dotnet publish Aquora.API.csproj -c Release --no-build -o /app/publish

# Stage 2: Production Runtime
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

# Install Kerberos/GSSAPI library required for Npgsql / PostgreSQL authentication
RUN apt-get update && apt-get install -y libgssapi-krb5-2 && rm -rf /var/lib/apt/lists/*

# Copy published binaries
COPY --from=build /app/publish .

# Environment Defaults for Production
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 10000

# Dynamic PORT binding for Render (binds to PORT provided by Render or 10000 by default)
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-10000} exec dotnet Aquora.API.dll"]
