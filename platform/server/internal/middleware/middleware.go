package middleware

import (
	"net/http"
	"strings"

	"codress/server/internal/auth"

	"github.com/gin-gonic/gin"
)

const ClaimsKey = "codress.claims"

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func bearerToken(c *gin.Context) string {
	header := c.GetHeader("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimSpace(header[len("Bearer "):])
	}
	return ""
}

// RequireRole 强制要求带指定角色的 JWT。
func RequireRole(secret, role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
			return
		}
		claims, err := auth.ParseToken(secret, token)
		if err != nil || claims.Role != role {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set(ClaimsKey, claims)
		c.Next()
	}
}

// OptionalUser 尝试解析用户 JWT,匿名照常放行(用于下载计数等可选记录)。
func OptionalUser(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if token := bearerToken(c); token != "" {
			if claims, err := auth.ParseToken(secret, token); err == nil && claims.Role == auth.RoleUser {
				c.Set(ClaimsKey, claims)
			}
		}
		c.Next()
	}
}

func ClaimsFrom(c *gin.Context) *auth.Claims {
	value, ok := c.Get(ClaimsKey)
	if !ok {
		return nil
	}
	claims, _ := value.(*auth.Claims)
	return claims
}
