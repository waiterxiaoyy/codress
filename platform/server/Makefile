.PHONY: run build test vet tidy seed

run:
	go run ./cmd/api

build:
	go build -o bin/codress-api$(shell go env GOEXE) ./cmd/api

test:
	go test ./...

vet:
	go vet ./...

tidy:
	go mod tidy

seed:
	go run ./cmd/seed -assets ../deploy/seed
