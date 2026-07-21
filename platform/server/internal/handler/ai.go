package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// aiMessage OpenAI chat message.
type aiMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type aiRequest struct {
	Model       string      `json:"model"`
	Messages    []aiMessage `json:"messages"`
	Temperature float64     `json:"temperature"`
	MaxTokens   int         `json:"max_tokens"`
}

type aiChoice struct {
	Message aiMessage `json:"message"`
}

type aiResponse struct {
	Choices []aiChoice `json:"choices"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// GenerateSkinMeta POST /api/admin/skins/ai-generate
// 根据用户描述调用 LLM 生成皮肤元数据（不含背景图）。
func (h *Admin) GenerateSkinMeta(c *gin.Context) {
	if h.Cfg.OpenAIAPIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OPENAI_API_KEY 未配置，请在 .env 中设置"})
		return
	}

	var input struct {
		Prompt string `json:"prompt" binding:"required"` // 用户描述，例如"赛博朋克风格，紫色霓虹，主体人物在右侧"
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	systemPrompt := `你是一个 Codex 编辑器皮肤设计专家。根据用户描述，生成一套完整的皮肤元数据 JSON。

规则：
- schemaVersion 固定为 1
- id 用 "ai-" + 时间戳格式，slug 用小写字母和连字符
- appearance: "auto" | "light" | "dark"
- art.safeArea: "left" | "right" | "center" | "none" — 背景图主体人物/焦点在哪侧，决定文字安全区
- art.taskMode: "ambient" | "banner" | "off" — 任务页背景模式
- art.focusX, art.focusY: 0~1，背景焦点位置（主体人物重心）
- colors: 完整配色对象，包含 background/panel/panelAlt/accent/accentAlt/secondary/highlight/text/muted/line
  - 暗色主题：background 用深色（#0d~#1a），text 用浅色
  - 浅色主题：background 用浅色，text 用深色
  - line 用 rgba 格式，透明度 0.2~0.35
- tagline: 一句中文描述，≤50字
- quote: 英文格言，全大写，≤40字
- statusText: 英文状态，全大写，≤20字
- brandSubtitle: 固定 "CODRESS"
- slug: 英文连字符格式，3~30字符

只输出 JSON，不要任何解释文字。格式：
{
  "slug": "...",
  "name": "...",
  "tagline": "...",
  "quote": "...",
  "statusText": "...",
  "brandSubtitle": "CODRESS",
  "appearance": "auto",
  "art": { "safeArea": "left", "taskMode": "ambient", "focusX": 0.7, "focusY": 0.45 },
  "colors": { "background": "...", "panel": "...", "panelAlt": "...", "accent": "...", "accentAlt": "...", "secondary": "...", "highlight": "...", "text": "...", "muted": "...", "line": "rgba(...)" }
}`

	reqBody := aiRequest{
		Model: h.Cfg.OpenAIModel,
		Messages: []aiMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: input.Prompt},
		},
		Temperature: 0.8,
		MaxTokens:   1200,
	}

	body, _ := json.Marshal(reqBody)
	httpReq, _ := http.NewRequest("POST", h.Cfg.OpenAIBaseURL+"/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.Cfg.OpenAIAPIKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 请求失败: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)

	var aiResp aiResponse
	if err := json.Unmarshal(respBytes, &aiResp); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 响应解析失败"})
		return
	}
	if aiResp.Error != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 错误: " + aiResp.Error.Message})
		return
	}
	if len(aiResp.Choices) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 无输出"})
		return
	}

	content := strings.TrimSpace(aiResp.Choices[0].Message.Content)
	// 去掉可能的 markdown 代码块包装
	if strings.HasPrefix(content, "```") {
		lines := strings.Split(content, "\n")
		var inner []string
		for _, l := range lines {
			if strings.HasPrefix(l, "```") {
				continue
			}
			inner = append(inner, l)
		}
		content = strings.Join(inner, "\n")
	}

	var meta map[string]any
	if err := json.Unmarshal([]byte(content), &meta); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": fmt.Sprintf("AI 输出不是合法 JSON: %v\nraw: %s", err, content)})
		return
	}

	// 强制 brandSubtitle
	meta["brandSubtitle"] = "CODRESS"
	// 生成预览用的 id
	meta["id"] = fmt.Sprintf("ai-%d", time.Now().UnixMilli())

	c.JSON(http.StatusOK, gin.H{"meta": meta})
}

// GenerateSkinPrompt POST /api/admin/skins/ai-image-prompt
// 根据皮肤元数据生成背景图生图提示词。
func (h *Admin) GenerateSkinPrompt(c *gin.Context) {
	if h.Cfg.OpenAIAPIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OPENAI_API_KEY 未配置"})
		return
	}

	var input struct {
		Meta map[string]any `json:"meta" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	metaJSON, _ := json.MarshalIndent(input.Meta, "", "  ")

	systemPrompt := `你是专业的 AI 绘图提示词工程师，专门为桌面软件换肤设计背景图。
根据皮肤元数据生成一段英文 Midjourney/Stable Diffusion 风格提示词。

要求：
- 纯背景壁纸，无任何 UI 元素、文字、按钮、对话框
- 分辨率暗示 2560x1440, 16:9 横幅构图
- 主体人物/焦点按 art.safeArea 指定侧放置（left=人物在左1/3，right=在右1/3，center=居中）
- 整体氛围与 colors 配色高度一致
- 结尾加: --ar 16:9 --q 2

只输出提示词文本，不要解释。`

	reqBody := aiRequest{
		Model: h.Cfg.OpenAIModel,
		Messages: []aiMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: "皮肤元数据：\n" + string(metaJSON)},
		},
		Temperature: 0.7,
		MaxTokens:   400,
	}

	body, _ := json.Marshal(reqBody)
	httpReq, _ := http.NewRequest("POST", h.Cfg.OpenAIBaseURL+"/chat/completions", bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+h.Cfg.OpenAIAPIKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)

	var aiResp aiResponse
	if err := json.Unmarshal(respBytes, &aiResp); err != nil || len(aiResp.Choices) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 响应解析失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"prompt": strings.TrimSpace(aiResp.Choices[0].Message.Content)})
}
