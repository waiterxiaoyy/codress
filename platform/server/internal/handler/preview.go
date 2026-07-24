package handler

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sync"
	"time"

	"codress/server/internal/config"
	"codress/server/internal/middleware"
	"codress/server/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const previewSessionTTL = 2 * time.Minute

type previewSession struct {
	SkinID    uint
	Target    string
	CreatedBy uint
	ExpiresAt time.Time
}

var previewSessionStore = struct {
	sync.Mutex
	items map[string]previewSession
}{items: make(map[string]previewSession)}

func newPreviewTicket() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// CreateSkinPreviewSession creates a narrow, one-use ticket. The desktop client
// never receives the administrator JWT and cannot use the ticket for CRUD.
func (h *Admin) CreateSkinPreviewSession(c *gin.Context) {
	var input struct {
		SkinID uint   `json:"skinId" binding:"required"`
		Target string `json:"target" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Target != "codex" && input.Target != "workbuddy" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "target must be codex|workbuddy"})
		return
	}
	var skin model.Skin
	if err := h.DB.First(&skin, input.SkinID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	if skin.Background == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "upload a background before previewing"})
		return
	}
	targetAllowed := false
	for _, target := range jsonTargets(skin.Targets) {
		if target == input.Target {
			targetAllowed = true
			break
		}
	}
	if !targetAllowed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "skin does not support requested target"})
		return
	}
	ticket, err := newPreviewTicket()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create preview ticket"})
		return
	}
	adminID := uint(0)
	if claims := middleware.ClaimsFrom(c); claims != nil {
		adminID = claims.UserID()
	}
	expiresAt := time.Now().Add(previewSessionTTL)
	previewSessionStore.Lock()
	for key, session := range previewSessionStore.items {
		if time.Now().After(session.ExpiresAt) {
			delete(previewSessionStore.items, key)
		}
	}
	previewSessionStore.items[ticket] = previewSession{
		SkinID: input.SkinID, Target: input.Target, CreatedBy: adminID, ExpiresAt: expiresAt,
	}
	previewSessionStore.Unlock()
	c.JSON(http.StatusOK, gin.H{
		"ticket": ticket, "expiresAt": expiresAt.UTC().Format(time.RFC3339),
		"scope": "skin:preview", "target": input.Target,
	})
}

// ExchangeSkinPreviewSession consumes the ticket and returns one draft snapshot.
// A ticket is deleted before database access so retries cannot replay it.
func ExchangeSkinPreviewSession(db *gorm.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Ticket string `json:"ticket" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		previewSessionStore.Lock()
		session, exists := previewSessionStore.items[input.Ticket]
		delete(previewSessionStore.items, input.Ticket)
		previewSessionStore.Unlock()
		if !exists || time.Now().After(session.ExpiresAt) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "preview ticket is invalid or expired"})
			return
		}
		var skin model.Skin
		if err := db.First(&skin, session.SkinID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"scope":  "skin:preview",
			"target": session.Target,
			"skin":   skinView(cfg, &skin),
		})
	}
}
