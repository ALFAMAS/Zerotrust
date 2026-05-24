package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

type TenantDataSource struct{ client *APIClient }
type TenantDataSourceModel struct {
	ID   types.String `tfsdk:"id"`
	Slug types.String `tfsdk:"slug"`
	Name types.String `tfsdk:"name"`
	Plan types.String `tfsdk:"plan"`
}

func NewTenantDataSource() datasource.DataSource { return &TenantDataSource{} }

func (d *TenantDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_tenant"
}

func (d *TenantDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Fetches a ZeroAuth tenant by slug.",
		Attributes: map[string]schema.Attribute{
			"id":   schema.StringAttribute{Computed: true},
			"slug": schema.StringAttribute{Required: true},
			"name": schema.StringAttribute{Computed: true},
			"plan": schema.StringAttribute{Computed: true},
		},
	}
}

func (d *TenantDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, _ *datasource.ConfigureResponse) {
	if req.ProviderData != nil {
		d.client = req.ProviderData.(*APIClient)
	}
}

func (d *TenantDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	var state TenantDataSourceModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	result, err := d.client.GetTenant(ctx, state.Slug.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Read tenant failed", err.Error())
		return
	}
	if result == nil {
		resp.Diagnostics.AddError("Tenant not found", "slug: "+state.Slug.ValueString())
		return
	}
	if id, ok := result["_id"].(string); ok {
		state.ID = types.StringValue(id)
	}
	if name, ok := result["name"].(string); ok {
		state.Name = types.StringValue(name)
	}
	if plan, ok := result["plan"].(string); ok {
		state.Plan = types.StringValue(plan)
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
