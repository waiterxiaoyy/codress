package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"codress/server/internal/auth"
	"codress/server/internal/config"
	"codress/server/internal/middleware"
	"codress/server/internal/model"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Public struct {
	DB    *gorm.DB
	Cfg   *config.Config
	OAuth *auth.OAuth
}

var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}$`)

func assetURL(cfg *config.Config, rel string) string {
	if rel == "" {
		return ""
	}
	return cfg.PublicBaseURL + "/static/" + rel
}

func parsePage(c *gin.Context) (page, pageSize int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ = strconv.Atoi(c.DefaultQuery("pageSize", "24"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 24
	}
	return page, pageSize
}

func jsonTargets(raw datatypes.JSON) []string {
	var targets []string
	_ = json.Unmarshal(raw, &targets)
	return targets
}

func skinView(cfg *config.Config, s *model.Skin) gin.H {
	return gin.H{
		"schemaVersion":   2,
		"slug":            s.Slug,
		"name":            s.Name,
		"description":     s.Description,
		"author":          s.Author,
		"category":        s.Category,
		"targets":         jsonTargets(s.Targets),
		"appearance":      s.Appearance,
		"art":             s.Art,
		"colors":          s.Colors,
		"tagline":         s.Tagline,
		"quote":           s.Quote,
		"statusText":      s.StatusText,
		"brandSubtitle":   s.BrandSubtitle,
		"projectPrefix":   s.ProjectPrefix,
		"projectLabel":    s.ProjectLabel,
		"backgroundUrl":   assetURL(cfg, s.Background),
		"previewLightUrl": assetURL(cfg, s.PreviewLight),
		"previewDarkUrl":  assetURL(cfg, s.PreviewDark),
		"hash":            s.Hash,
		"sizeBytes":       s.SizeBytes,
		"downloads":       s.Downloads,
		"status":          s.Status,
		"sort":            s.Sort,
	}
}

func petView(cfg *config.Config, p *model.Pet) gin.H {
	view := gin.H{
		"schemaVersion": 1,
		"slug":          p.Slug,
		"name":          p.Name,
		"description":   p.Description,
		"category":      p.Category,
		"targets":       jsonTargets(p.Targets),
		"imageUrl":      assetURL(cfg, p.Image),
		"animation":     p.Animation,
		"hash":          p.Hash,
		"sizeBytes":     p.SizeBytes,
		"downloads":     p.Downloads,
		"status":        p.Status,
		"sort":          p.Sort,
		"stylePreset":   p.StylePreset,
		"tags":          p.Tags,
		"author":        p.Author,
	}
	if p.SpriteSheet != "" {
		view["spriteSheet"] = assetURL(cfg, p.SpriteSheet)
	}
	if len(p.Manifest) > 0 {
		var manifest map[string]interface{}
		if err := json.Unmarshal(p.Manifest, &manifest); err == nil {
			view["manifest"] = manifest
		}
	}
	return view
}

func (h *Public) recordEvent(userID uint, action, itemType, slug, target string, meta gin.H) {
	if userID == 0 {
		return
	}
	var raw datatypes.JSON
	if meta != nil {
		if bytes, err := json.Marshal(meta); err == nil {
			raw = bytes
		}
	}
	h.DB.Create(&model.UserEvent{
		UserID: userID, Action: action, ItemType: itemType,
		ItemSlug: slug, Target: target, Meta: raw,
	})
}

func (h *Public) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"name": "codress-api", "status": "ok", "time": time.Now().Format(time.RFC3339)})
}

// ---- 皮肤 / 宠物 ----

func (h *Public) ListSkins(c *gin.Context) {
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.Skin{}).Where("status = ?", "published")
	if target := c.Query("target"); target != "" {
		query = query.Where("targets LIKE ?", `%"`+target+`"%`)
	}
	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}
	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("name LIKE ? OR description LIKE ?", like, like)
	}
	var total int64
	query.Count(&total)
	var skins []model.Skin
	if err := query.Order("sort DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&skins).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(skins))
	for i := range skins {
		items = append(items, skinView(h.Cfg, &skins[i]))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Public) GetSkin(c *gin.Context) {
	var skin model.Skin
	if err := h.DB.Where("slug = ? AND status = ?", c.Param("slug"), "published").First(&skin).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		return
	}
	c.JSON(http.StatusOK, skinView(h.Cfg, &skin))
}

func (h *Public) DownloadSkin(c *gin.Context) {
	var skin model.Skin
	if err := h.DB.Where("slug = ? AND status = ?", c.Param("slug"), "published").First(&skin).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		return
	}
	h.DB.Model(&skin).UpdateColumn("downloads", gorm.Expr("downloads + 1"))
	if claims := middleware.ClaimsFrom(c); claims != nil {
		h.recordEvent(claims.UserID(), "download", "skin", skin.Slug, c.Query("target"), nil)
	}
	c.JSON(http.StatusOK, gin.H{
		"url":       assetURL(h.Cfg, skin.Background),
		"hash":      skin.Hash,
		"sizeBytes": skin.SizeBytes,
		"manifest":  skinView(h.Cfg, &skin),
	})
}

func (h *Public) ListPets(c *gin.Context) {
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.Pet{}).Where("status = ?", "published")
	if target := c.Query("target"); target != "" {
		query = query.Where("targets LIKE ?", `%"`+target+`"%`)
	}
	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}
	var total int64
	query.Count(&total)
	var pets []model.Pet
	if err := query.Order("sort DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&pets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(pets))
	for i := range pets {
		items = append(items, petView(h.Cfg, &pets[i]))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Public) GetPet(c *gin.Context) {
	var pet model.Pet
	if err := h.DB.Where("slug = ? AND status = ?", c.Param("slug"), "published").First(&pet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "pet not found"})
		return
	}
	c.JSON(http.StatusOK, petView(h.Cfg, &pet))
}

func (h *Public) DownloadPet(c *gin.Context) {
	var pet model.Pet
	if err := h.DB.Where("slug = ? AND status = ?", c.Param("slug"), "published").First(&pet).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "pet not found"})
		return
	}
	h.DB.Model(&pet).UpdateColumn("downloads", gorm.Expr("downloads + 1"))
	if claims := middleware.ClaimsFrom(c); claims != nil {
		h.recordEvent(claims.UserID(), "download", "pet", pet.Slug, c.Query("target"), nil)
	}
	// 优先返回 spritesheet URL，兼容旧的 image
	url := assetURL(h.Cfg, pet.SpriteSheet)
	if pet.SpriteSheet == "" {
		url = assetURL(h.Cfg, pet.Image)
	}
	c.JSON(http.StatusOK, gin.H{
		"url":       url,
		"hash":      pet.Hash,
		"sizeBytes": pet.SizeBytes,
		"manifest":  petView(h.Cfg, &pet),
	})
}

func (h *Public) ListCategories(c *gin.Context) {
	query := h.DB.Model(&model.Category{})
	if t := c.Query("type"); t != "" {
		query = query.Where("type = ?", t)
	}
	var categories []model.Category
	if err := query.Order("sort ASC, id ASC").Find(&categories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": categories})
}

// ---- 适配器 / 客户端版本 / 遥测 ----

func (h *Public) GetAdapter(c *gin.Context) {
	query := h.DB.Where("app_id = ? AND status = ?", c.Param("appId"), "active")
	if platform := c.Query("platform"); platform != "" {
		query = query.Where("platform IN ?", []string{"all", platform})
	}
	var adapter model.AppAdapter
	if err := query.Order("version DESC").First(&adapter).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active adapter config"})
		return
	}
	c.JSON(http.StatusOK, adapter)
}

func (h *Public) LatestClient(c *gin.Context) {
	platform := c.Query("platform")
	if platform != "win" && platform != "mac" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform must be win or mac"})
		return
	}
	var release model.ClientRelease
	if err := h.DB.Where("platform = ?", platform).Order("id DESC").First(&release).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no release yet"})
		return
	}
	c.JSON(http.StatusOK, release)
}

func (h *Public) PostTelemetry(c *gin.Context) {
	var input struct {
		AppID          string `json:"appId" binding:"required"`
		AppVersion     string `json:"appVersion"`
		AdapterVersion string `json:"adapterVersion"`
		SkinSlug       string `json:"skinSlug"`
		ClientVersion  string `json:"clientVersion"`
		OS             string `json:"os"`
		Pass           bool   `json:"pass"`
		Message        string `json:"message"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(input.Message) > 500 {
		input.Message = input.Message[:500]
	}
	event := model.TelemetryEvent{
		AppID: input.AppID, AppVersion: input.AppVersion, AdapterVersion: input.AdapterVersion,
		SkinSlug: input.SkinSlug, ClientVersion: input.ClientVersion, OS: input.OS,
		Pass: input.Pass, Message: input.Message,
	}
	if err := h.DB.Create(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 认证 ----

func (h *Public) AuthProviders(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"github": h.OAuth.Enabled(auth.ProviderGithub),
		"google": h.OAuth.Enabled(auth.ProviderGoogle),
		"dev":    h.Cfg.DevLogin,
	})
}

func (h *Public) OAuthLogin(c *gin.Context) {
	provider := c.Param("provider")
	conf, err := h.OAuth.Conf(provider)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	port := 0
	if raw := c.Query("port"); raw != "" {
		port, err = strconv.Atoi(raw)
		if err != nil || port < 1024 || port > 65535 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "port must be 1024..65535"})
			return
		}
	}
	state, err := h.OAuth.SignState(port)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Redirect(http.StatusFound, conf.AuthCodeURL(state))
}

func (h *Public) OAuthCallback(c *gin.Context) {
	provider := c.Param("provider")
	conf, err := h.OAuth.Conf(provider)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	port, err := h.OAuth.VerifyState(c.Query("state"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid state: " + err.Error()})
		return
	}
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing code"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	token, err := conf.Exchange(ctx, code)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "oauth exchange failed: " + err.Error()})
		return
	}
	profile, err := h.OAuth.FetchProfile(ctx, provider, token)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "fetch profile failed: " + err.Error()})
		return
	}
	jwtToken, user, err := h.loginUser(provider, profile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if port > 0 {
		c.Redirect(http.StatusFound, fmt.Sprintf("http://127.0.0.1:%d/auth/callback?token=%s", port, jwtToken))
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": jwtToken, "user": user})
}

func (h *Public) DevLogin(c *gin.Context) {
	if !h.Cfg.DevLogin {
		c.JSON(http.StatusForbidden, gin.H{"error": "dev login is disabled"})
		return
	}
	var input struct {
		Name  string `json:"name" binding:"required"`
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	token, user, err := h.loginUser(auth.ProviderDev, &auth.Profile{
		UID: input.Name, Email: input.Email, Name: input.Name,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func (h *Public) loginUser(provider string, profile *auth.Profile) (string, *model.User, error) {
	var user model.User
	err := h.DB.Where("provider = ? AND provider_uid = ?", provider, profile.UID).First(&user).Error
	now := time.Now()
	if err != nil {
		user = model.User{
			Provider: provider, ProviderUID: profile.UID,
			Email: profile.Email, Name: profile.Name, AvatarURL: profile.Avatar,
			LastLoginAt: now,
		}
		if err := h.DB.Create(&user).Error; err != nil {
			return "", nil, err
		}
	} else {
		user.Email = profile.Email
		user.Name = profile.Name
		user.AvatarURL = profile.Avatar
		user.LastLoginAt = now
		h.DB.Save(&user)
	}
	h.recordEvent(user.ID, "login", "app", provider, "", nil)
	token, err := auth.IssueToken(h.Cfg.JWTSecret, user.ID, auth.RoleUser, user.Name, 30*24*time.Hour)
	if err != nil {
		return "", nil, err
	}
	return token, &user, nil
}

// ---- 当前用户(记录中心) ----

func (h *Public) Me(c *gin.Context) {
	claims := middleware.ClaimsFrom(c)
	var user model.User
	if err := h.DB.First(&user, claims.UserID()).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user)
}

func (h *Public) MyEvents(c *gin.Context) {
	claims := middleware.ClaimsFrom(c)
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.UserEvent{}).Where("user_id = ?", claims.UserID())
	var total int64
	query.Count(&total)
	var events []model.UserEvent
	if err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Public) CreateEvent(c *gin.Context) {
	claims := middleware.ClaimsFrom(c)
	var input struct {
		Action   string `json:"action" binding:"required"`
		ItemType string `json:"itemType" binding:"required"`
		ItemSlug string `json:"itemSlug"`
		Target   string `json:"target"`
		Meta     gin.H  `json:"meta"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	validActions := map[string]bool{"download": true, "apply": true, "remove": true, "favorite": true, "unfavorite": true, "login": true}
	validTypes := map[string]bool{"skin": true, "pet": true, "app": true}
	if !validActions[input.Action] || !validTypes[input.ItemType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid action or itemType"})
		return
	}
	h.recordEvent(claims.UserID(), input.Action, input.ItemType, input.ItemSlug, input.Target, input.Meta)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Public) ToggleFavorite(c *gin.Context) {
	claims := middleware.ClaimsFrom(c)
	var input struct {
		ItemType string `json:"itemType" binding:"required"`
		ItemSlug string `json:"itemSlug" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if (input.ItemType != "skin" && input.ItemType != "pet") || !slugPattern.MatchString(input.ItemSlug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid itemType or itemSlug"})
		return
	}
	var existing model.Favorite
	err := h.DB.Where("user_id = ? AND item_type = ? AND item_slug = ?",
		claims.UserID(), input.ItemType, input.ItemSlug).First(&existing).Error
	if err == nil {
		h.DB.Delete(&existing)
		h.recordEvent(claims.UserID(), "unfavorite", input.ItemType, input.ItemSlug, "", nil)
		c.JSON(http.StatusOK, gin.H{"favorited": false})
		return
	}
	favorite := model.Favorite{UserID: claims.UserID(), ItemType: input.ItemType, ItemSlug: input.ItemSlug}
	if err := h.DB.Create(&favorite).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.recordEvent(claims.UserID(), "favorite", input.ItemType, input.ItemSlug, "", nil)
	c.JSON(http.StatusOK, gin.H{"favorited": true})
}

func (h *Public) ListFavorites(c *gin.Context) {
	claims := middleware.ClaimsFrom(c)
	var favorites []model.Favorite
	if err := h.DB.Where("user_id = ?", claims.UserID()).Order("id DESC").Find(&favorites).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": favorites})
}
