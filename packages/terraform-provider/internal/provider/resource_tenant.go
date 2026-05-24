package provider

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

type TenantResource struct{ client *APIClient }

type TenantResourceModel struct {
	ID          types.String `tfsdk:"id"`
	Slug        types.String `tfsdk:"slug"`
	Name        types.String `tfsdk:"name"`
	DisplayName types.String `tfsdk:"display_name"`
	Status      types.String `tfsdk:"status"`
	Plan        types.String `tfsdk:"plan"`
	MFARequired types.Bool   `tfsdk:"mfa_required"`
	EnforceSSO  types.Bool   `tfsdk:"enforce_sso"`
	SessionTTL  types.Int64  `tfsdk:"session_ttl"`
	MaxUsers    types.Int64  `tfsdk:"max_users"`
}

func NewTenantResource() resource.Resource { return &TenantResource{} }

func (r *TenantResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_tenant"
}

func (r *TenantResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a ZeroAuth tenant.",
		Attributes: map[string]schema.Attribute{
			"id":           schema.StringAttribute{Computed: true, PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()}},
			"slug":         schema.StringAttribute{Required: true},
			"name":         schema.StringAttribute{Required: true},
			"display_name": schema.StringAttribute{Optional: true},
			"status":       schema.StringAttribute{Optional: true, Computed: true},
			"plan":         schema.StringAttribute{Optional: true, Computed: true},
			"mfa_required": schema.BoolAttribute{Optional: true},
			"enforce_sso":  schema.BoolAttribute{Optional: true},
			"session_ttl":  schema.Int64Attribute{Optional: true},
			"max_users":    schema.Int64Attribute{Optional: true},
		},
	}
}

func (r *TenantResource) Configure(_ context.Context, req resource.ConfigureRequest, _ *resource.ConfigureResponse) {
	if req.ProviderData != nil {
		r.client = req.ProviderData.(*APIClient)
	}
}

func (r *TenantResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan TenantResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	data := map[string]interface{}{
		"slug": plan.Slug.ValueString(),
		"name": plan.Name.ValueString(),
		"settings": map[string]interface{}{
			"mfaRequired": plan.MFARequired.ValueBool(),
			"enforceSSO":  plan.EnforceSSO.ValueBool(),
			"sessionTTL":  plan.SessionTTL.ValueInt64(),
		},
	}
	if !plan.DisplayName.IsNull() {
		data["displayName"] = plan.DisplayName.ValueString()
	}
	if !plan.Plan.IsNull() {
		data["plan"] = plan.Plan.ValueString()
	}
	result, err := r.client.CreateTenant(ctx, data)
	if err != nil {
		resp.Diagnostics.AddError("Create tenant failed", err.Error())
		return
	}
	plan.ID = types.StringValue(fmt.Sprintf("%v", result["_id"]))
	plan.Status = types.StringValue(fmt.Sprintf("%v", result["status"]))
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *TenantResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state TenantResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	result, err := r.client.GetTenant(ctx, state.ID.ValueString())
	if err != nil {
		resp.Diagnostics.AddError("Read tenant failed", err.Error())
		return
	}
	if result == nil {
		resp.State.RemoveResource(ctx)
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *TenantResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan TenantResourceModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	data := map[string]interface{}{"name": plan.Name.ValueString()}
	_, err := r.client.UpdateTenant(ctx, plan.ID.ValueString(), data)
	if err != nil {
		resp.Diagnostics.AddError("Update tenant failed", err.Error())
		return
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *TenantResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state TenantResourceModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	if err := r.client.DeleteTenant(ctx, state.ID.ValueString()); err != nil {
		resp.Diagnostics.AddError("Delete tenant failed", err.Error())
	}
}
