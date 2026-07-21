package config

import (
	"os"
	"strconv"
)

// Config 全部来自环境变量(支持 .env),字段含义见 .env.example。
type Config struct {
	Port          string
	GinMode       string
	DBDriver      string // mysql | sqlite(开发/测试)
	DBDSN         string
	JWTSecret     string
	StorageDir    string
	PublicBaseURL string

	AdminUsername string
	AdminPassword string

	GithubClientID     string
	GithubClientSecret string
	GoogleClientID     string
	GoogleClientSecret string
	// DevLogin: 未配置任何 OAuth 时默认开启,便于本地联调;生产显式设 DEV_LOGIN=0 关闭。
	DevLogin bool
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func Load() *Config {
	c := &Config{
		Port:          env("PORT", "8080"),
		GinMode:       env("GIN_MODE", "debug"),
		DBDriver:      env("DB_DRIVER", "mysql"),
		DBDSN:         env("DB_DSN", "root:codress@tcp(127.0.0.1:3306)/codress?charset=utf8mb4&parseTime=True&loc=Local"),
		JWTSecret:     env("JWT_SECRET", "codress-dev-secret-change-me"),
		StorageDir:    env("STORAGE_DIR", "./storage"),
		PublicBaseURL: env("PUBLIC_BASE_URL", "http://127.0.0.1:8080"),

		AdminUsername: env("ADMIN_USERNAME", "admin"),
		AdminPassword: env("ADMIN_PASSWORD", "codress123"),

		GithubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GithubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
	}
	if raw := os.Getenv("DEV_LOGIN"); raw != "" {
		on, err := strconv.ParseBool(raw)
		c.DevLogin = err == nil && on
	} else {
		c.DevLogin = c.GithubClientID == "" && c.GoogleClientID == ""
	}
	return c
}
