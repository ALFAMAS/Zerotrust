package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type APIClient struct {
	BaseURL    string
	APIToken   string
	HTTPClient *http.Client
}

func NewAPIClient(baseURL, token string) *APIClient {
	return &APIClient{
		BaseURL:    baseURL,
		APIToken:   token,
		HTTPClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *APIClient) doRequest(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	buf := new(bytes.Buffer)
	if body != nil {
		if err := json.NewEncoder(buf).Encode(body); err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIToken)
	req.Header.Set("Content-Type", "application/json")
	return c.HTTPClient.Do(req)
}

func decode(resp *http.Response, v interface{}) error {
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("API error: %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func (c *APIClient) CreateTenant(ctx context.Context, data map[string]interface{}) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, "POST", "/admin/tenants", data)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	return result, decode(resp, &result)
}

func (c *APIClient) GetTenant(ctx context.Context, id string) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, "GET", "/admin/tenants/"+id, nil)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == 404 {
		resp.Body.Close()
		return nil, nil
	}
	var result map[string]interface{}
	return result, decode(resp, &result)
}

func (c *APIClient) UpdateTenant(ctx context.Context, id string, data map[string]interface{}) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, "PUT", "/admin/tenants/"+id, data)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	return result, decode(resp, &result)
}

func (c *APIClient) DeleteTenant(ctx context.Context, id string) error {
	resp, err := c.doRequest(ctx, "DELETE", "/admin/tenants/"+id, nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (c *APIClient) CreateRole(ctx context.Context, data map[string]interface{}) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, "POST", "/admin/roles", data)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	return result, decode(resp, &result)
}

func (c *APIClient) GetRole(ctx context.Context, id string) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, "GET", "/admin/roles/"+id, nil)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == 404 {
		resp.Body.Close()
		return nil, nil
	}
	var result map[string]interface{}
	return result, decode(resp, &result)
}

func (c *APIClient) DeleteRole(ctx context.Context, id string) error {
	resp, err := c.doRequest(ctx, "DELETE", "/admin/roles/"+id, nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (c *APIClient) CreateWebhook(ctx context.Context, data map[string]interface{}) (map[string]interface{}, error) {
	resp, err := c.doRequest(ctx, "POST", "/admin/webhooks", data)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	return result, decode(resp, &result)
}

func (c *APIClient) DeleteWebhook(ctx context.Context, id string) error {
	resp, err := c.doRequest(ctx, "DELETE", "/admin/webhooks/"+id, nil)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}
