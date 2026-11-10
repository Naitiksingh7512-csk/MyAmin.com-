insert into public.service_categories (slug,name_en,name_hi,description,icon,is_active,sort_order)
values
 ('land-measurement','Land Measurement','जमीन की नापी','Land measurement and area calculation services.','📏',true,10),
 ('boundary-demarcation','Boundary Demarcation','सीमांकन / Boundary','Boundary identification and demarcation assistance.','📐',true,20),
 ('site-sketch-map','Site Sketch Map','नज़री नक्शा','Site sketch and map preparation assistance.','🗺️',true,30),
 ('other-land-help','Other Land Assistance','जमीन से जुड़ी अन्य सहायता','Other land-related assistance and guidance.','🧭',true,40)
on conflict (slug) do update set name_en=excluded.name_en,name_hi=excluded.name_hi,description=excluded.description,icon=excluded.icon,is_active=true,sort_order=excluded.sort_order,updated_at=now();
