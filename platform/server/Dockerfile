FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/codress-api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=build /out/codress-api /app/codress-api
ENV STORAGE_DIR=/data/storage
VOLUME ["/data/storage"]
EXPOSE 8080
ENTRYPOINT ["/app/codress-api"]
