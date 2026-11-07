export async function chooseCost(page,scope,id,checked=true){
 const group=page.locator(scope).locator('[data-cost-group="'+(id.startsWith('project_')?'projects':'services')+'"]');
 await group.locator('.ob-service-trigger').click();await group.locator('.ob-service-search').fill(id);
 await group.locator('input[type=checkbox][value="'+id+'"]').setChecked(checked);
 await group.getByRole('button',{name:'Tamam',exact:true}).click();
}
export async function chooseBoth(page,id){for(const option of ['growth_operations','operations_bundle'])await chooseCost(page,'.ob-standard-editor [data-alternative="'+option+'"]',id);}
