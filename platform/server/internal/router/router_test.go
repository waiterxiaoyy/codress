package router_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"codress/server/internal/config"
	"codress/server/internal/database"
	"codress/server/internal/router"
)

// tinyPNG 是一张 1x1 透明 PNG。
var tinyPNG, _ = base64.StdEncoding.DecodeString(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

type client struct {
	t     *testing.T
	base  string
	token string
}

func (c *client) do(method, path string, body io.Reader, contentType string) (int, map[string]any) {
	c.t.Helper()
	req, err := http.NewRequest(method, c.base+path, body)
	if err != nil {
		c.t.Fatal(err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	_ = json.Unmarshal(raw, &out)
	if out == nil {
		out = map[string]any{"_raw": string(raw)}
	}
	return resp.StatusCode, out
}

func (c *client) getJSON(path string) (int, map[string]any) {
	return c.do(http.MethodGet, path, nil, "")
}

func (c *client) postJSON(path string, payload any) (int, map[string]any) {
	raw, _ := json.Marshal(payload)
	return c.do(http.MethodPost, path, bytes.NewReader(raw), "application/json")
}

func (c *client) putJSON(path string, payload any) (int, map[string]any) {
	raw, _ := json.Marshal(payload)
	return c.do(http.MethodPut, path, bytes.NewReader(raw), "application/json")
}

func (c *client) upload(path, field, filename string, data []byte) (int, map[string]any) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile(field, filename)
	if err != nil {
		c.t.Fatal(err)
	}
	if _, err := part.Write(data); err != nil {
		c.t.Fatal(err)
	}
	writer.Close()
	return c.do(http.MethodPost, path, &buf, writer.FormDataContentType())
}

func mustStatus(t *testing.T, got int, want int, context string, body map[string]any) {
	t.Helper()
	if got != want {
		t.Fatalf("%s: got HTTP %d want %d (body=%v)", context, got, want, body)
	}
}

// TestFullFlow 覆盖:管理端登录→建分类→建皮肤→传图→发布→公开列表/详情/下载→
// 静态文件→用户登录→行为记录→收藏→宠物→适配器下发→遥测→版本→看板。
func TestFullFlow(t *testing.T) {
	cfg := &config.Config{
		Port: "0", GinMode: "release",
		DBDriver: "sqlite", DBDSN: "file:codress_e2e?mode=memory&cache=shared",
		JWTSecret: "test-secret", StorageDir: t.TempDir(),
		AdminUsername: "admin", AdminPassword: "test123",
		PublicBaseURL: "http://placeholder", DevLogin: true,
	}
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		t.Fatal(err)
	}
	db, err := database.Open(cfg)
	if err != nil {
		t.Fatal(err)
	}
	engine := router.New(db, cfg)
	server := httptest.NewServer(engine)
	defer server.Close()
	cfg.PublicBaseURL = server.URL // 资源 URL 指向测试服务器自身

	anon := &client{t: t, base: server.URL}

	// 健康检查
	code, body := anon.getJSON("/api/v1/health")
	mustStatus(t, code, 200, "health", body)

	// 管理端登录(错误密码应 401)
	code, body = anon.postJSON("/api/admin/auth/login", map[string]string{"username": "admin", "password": "wrong"})
	mustStatus(t, code, 401, "admin login wrong password", body)
	code, body = anon.postJSON("/api/admin/auth/login", map[string]string{"username": "admin", "password": "test123"})
	mustStatus(t, code, 200, "admin login", body)
	adminC := &client{t: t, base: server.URL, token: body["token"].(string)}

	// 未带 token 的管理接口应 401
	code, body = anon.getJSON("/api/admin/skins")
	mustStatus(t, code, 401, "admin without token", body)

	// 分类
	code, body = adminC.postJSON("/api/admin/categories", map[string]any{"type": "skin", "slug": "test-cat", "name": "测试分类", "sort": 1})
	mustStatus(t, code, 200, "create category", body)
	code, body = anon.getJSON("/api/v1/categories?type=skin")
	mustStatus(t, code, 200, "public categories", body)

	// 创建皮肤
	code, body = adminC.postJSON("/api/admin/skins", map[string]any{
		"slug": "night-city", "name": "夜城", "description": "霓虹夜景",
		"category": "test-cat", "targets": []string{"codex", "workbuddy"},
		"appearance": "auto", "art": map[string]any{"safeArea": "left", "focusX": 0.72},
	})
	mustStatus(t, code, 200, "create skin", body)
	skinID := fmt.Sprintf("%v", body["id"])

	// 非法 targets 拒绝
	code, body = adminC.postJSON("/api/admin/skins", map[string]any{
		"slug": "bad", "name": "x", "targets": []string{"vscode"},
	})
	mustStatus(t, code, 400, "invalid targets rejected", body)

	// 没有背景图不允许发布
	code, body = adminC.postJSON("/api/admin/skins/"+skinID+"/status", map[string]string{"status": "published"})
	mustStatus(t, code, 400, "publish without background rejected", body)

	// 上传背景图 + 发布
	code, body = adminC.upload("/api/admin/skins/"+skinID+"/assets", "background", "bg.png", tinyPNG)
	mustStatus(t, code, 200, "upload background", body)
	code, body = adminC.postJSON("/api/admin/skins/"+skinID+"/status", map[string]string{"status": "published"})
	mustStatus(t, code, 200, "publish skin", body)

	// 公开列表:按平台过滤
	code, body = anon.getJSON("/api/v1/skins?target=codex")
	mustStatus(t, code, 200, "public skins codex", body)
	if int(body["total"].(float64)) != 1 {
		t.Fatalf("expected 1 published skin, got %v", body["total"])
	}
	code, body = anon.getJSON("/api/v1/skins?target=workbuddy")
	mustStatus(t, code, 200, "public skins workbuddy", body)
	if int(body["total"].(float64)) != 1 {
		t.Fatalf("expected workbuddy skin visible, got %v", body["total"])
	}

	// 详情 + 下载 + 静态文件可访问
	code, body = anon.getJSON("/api/v1/skins/night-city")
	mustStatus(t, code, 200, "skin detail", body)
	code, body = anon.postJSON("/api/v1/skins/night-city/download", nil)
	mustStatus(t, code, 200, "skin download", body)
	downloadURL, _ := body["url"].(string)
	if downloadURL == "" {
		t.Fatal("download url is empty")
	}
	resp, err := http.Get(downloadURL)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || !bytes.Equal(raw, tinyPNG) {
		t.Fatalf("static background fetch failed: HTTP %d, %d bytes", resp.StatusCode, len(raw))
	}
	code, body = anon.getJSON("/api/v1/skins/night-city")
	mustStatus(t, code, 200, "skin detail after download", body)
	if int(body["downloads"].(float64)) != 1 {
		t.Fatalf("expected downloads=1, got %v", body["downloads"])
	}

	// 用户体系:dev 登录 → 记录 → 收藏
	code, body = anon.getJSON("/api/v1/auth/providers")
	mustStatus(t, code, 200, "providers", body)
	if body["dev"] != true {
		t.Fatalf("dev login should be enabled in test, got %v", body)
	}
	code, body = anon.postJSON("/api/v1/auth/dev", map[string]string{"name": "tester", "email": "t@codress.cc"})
	mustStatus(t, code, 200, "dev login", body)
	userC := &client{t: t, base: server.URL, token: body["token"].(string)}

	code, body = userC.getJSON("/api/v1/me")
	mustStatus(t, code, 200, "me", body)
	code, body = userC.postJSON("/api/v1/me/events", map[string]any{
		"action": "apply", "itemType": "skin", "itemSlug": "night-city", "target": "codex",
	})
	mustStatus(t, code, 200, "record apply event", body)
	code, body = userC.getJSON("/api/v1/me/events")
	mustStatus(t, code, 200, "list my events", body)
	if int(body["total"].(float64)) < 2 { // login + apply
		t.Fatalf("expected >=2 events (login+apply), got %v", body["total"])
	}
	code, body = userC.postJSON("/api/v1/me/favorites/toggle", map[string]string{"itemType": "skin", "itemSlug": "night-city"})
	mustStatus(t, code, 200, "favorite", body)
	if body["favorited"] != true {
		t.Fatalf("expected favorited=true, got %v", body)
	}
	code, body = userC.postJSON("/api/v1/me/favorites/toggle", map[string]string{"itemType": "skin", "itemSlug": "night-city"})
	mustStatus(t, code, 200, "unfavorite", body)
	if body["favorited"] != false {
		t.Fatalf("expected favorited=false, got %v", body)
	}

	// 宠物:创建 → 传图 → 发布 → 公开列表(codex)
	code, body = adminC.postJSON("/api/admin/pets", map[string]any{
		"slug": "pixel-cat", "name": "像素猫", "targets": []string{"codex"}, "animation": "bounce",
	})
	mustStatus(t, code, 200, "create pet", body)
	petID := fmt.Sprintf("%v", body["id"])
	code, body = adminC.upload("/api/admin/pets/"+petID+"/assets", "image", "cat.png", tinyPNG)
	mustStatus(t, code, 200, "upload pet image", body)
	code, body = adminC.postJSON("/api/admin/pets/"+petID+"/status", map[string]string{"status": "published"})
	mustStatus(t, code, 200, "publish pet", body)
	code, body = anon.getJSON("/api/v1/pets?target=codex")
	mustStatus(t, code, 200, "public pets", body)
	if int(body["total"].(float64)) != 1 {
		t.Fatalf("expected 1 pet, got %v", body["total"])
	}
	code, body = anon.postJSON("/api/v1/pets/pixel-cat/download", nil)
	mustStatus(t, code, 200, "pet download", body)

	// 适配器配置下发
	code, body = adminC.postJSON("/api/admin/adapters", map[string]any{
		"appId": "codex", "platform": "all", "version": 3,
		"config": map[string]any{"defaultPort": 9341, "targetUrlPrefixes": []string{"app://"}},
		"css":    "/* hotfix */",
	})
	mustStatus(t, code, 200, "create adapter", body)
	adapterID := fmt.Sprintf("%v", body["id"])
	code, body = anon.getJSON("/api/v1/adapters/codex")
	mustStatus(t, code, 404, "adapter draft invisible", body)
	code, body = adminC.postJSON("/api/admin/adapters/"+adapterID+"/status", map[string]string{"status": "active"})
	mustStatus(t, code, 200, "activate adapter", body)
	code, body = anon.getJSON("/api/v1/adapters/codex?platform=win")
	mustStatus(t, code, 200, "adapter visible", body)
	if int(body["version"].(float64)) != 3 {
		t.Fatalf("expected adapter version 3, got %v", body["version"])
	}

	// 遥测 + 客户端版本 + 看板
	code, body = anon.postJSON("/api/v1/telemetry/verify", map[string]any{
		"appId": "codex", "appVersion": "1.2.3", "skinSlug": "night-city",
		"clientVersion": "0.1.0", "os": "win", "pass": true,
	})
	mustStatus(t, code, 200, "telemetry", body)
	code, body = adminC.postJSON("/api/admin/releases", map[string]any{
		"platform": "win", "version": "0.1.0", "url": "https://dl.codress.cc/Codress-0.1.0.exe",
	})
	mustStatus(t, code, 200, "create release", body)
	code, body = anon.getJSON("/api/v1/client/latest?platform=win")
	mustStatus(t, code, 200, "latest client", body)
	if body["version"] != "0.1.0" {
		t.Fatalf("expected release 0.1.0, got %v", body["version"])
	}
	code, body = adminC.getJSON("/api/admin/stats/overview")
	mustStatus(t, code, 200, "stats overview", body)
	code, body = adminC.getJSON("/api/admin/users")
	mustStatus(t, code, 200, "admin users", body)
	if int(body["total"].(float64)) != 1 {
		t.Fatalf("expected 1 user, got %v", body["total"])
	}

	// 皮肤更新 + 下架
	code, body = adminC.putJSON("/api/admin/skins/"+skinID, map[string]any{"name": "夜城 Pro", "sort": 5})
	mustStatus(t, code, 200, "update skin", body)
	code, body = adminC.postJSON("/api/admin/skins/"+skinID+"/status", map[string]string{"status": "offline"})
	mustStatus(t, code, 200, "offline skin", body)
	code, body = anon.getJSON("/api/v1/skins?target=codex")
	mustStatus(t, code, 200, "public skins after offline", body)
	if int(body["total"].(float64)) != 0 {
		t.Fatalf("expected 0 skins after offline, got %v", body["total"])
	}
}
