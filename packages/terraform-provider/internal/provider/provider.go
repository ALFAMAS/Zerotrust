package provider

import (
	"context"
	"os"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

type ZeroAuthProvider struct{ version string }

type ZeroAuthProviderModel struct {
	BaseURL  types.String `tfsdk:"base_url"`
	APIToken types.String `tfsdk:"api_token"`
}

func New(version string) func() provider.Provider {
	return func() provider.Provider { return &ZeroAuthProvider{version: version} }
}

func (p *ZeroAuthProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "zeroauth"
	resp.Version = p.version
}

func (p *ZeroAuthProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manage ZeroAuth tenants, roles, and webhooks as infrastructure.",
		Attributes: map[string]schema.Attribute{
			"base_url": schema.StringAttribute{
				Description: "ZeroAuth API base URL. Env: ZEROAUTH_BASE_URL",
				Optional:    true,
			},
			"api_token": schema.StringAttribute{
				Description: "Admin API token. Env: ZEROAUTH_API_TOKEN",
				Optional:    true,
				Sensitive:   true,
			},
		},
	}
}

func (p *ZeroAuthProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config ZeroAuthProviderModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}
	baseURL := os.Getenv("ZEROAUTH_BASE_URL")
	if !config.BaseURL.IsNull() {
		baseURL = config.BaseURL.ValueString()
	}
	apiToken := os.Getenv("ZEROAUTH_API_TOKEN")
	if !config.APIToken.IsNull() {
		apiToken = config.APIToken.ValueString()
	}
	client := NewAPIClient(baseURL, apiToken)
	resp.DataSourceData = client
	resp.ResourceData = client
}

func (p *ZeroAuthProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		NewTenantResource,
		NewRoleResource,
		NewWebhookResource,
	}
}

func (p *ZeroAuthProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		NewTenantDataSource,
	}
}
