// src/constants/views.ts
export const VIEWS = {
    HOME: "home",
    PERSONAL_COLOR: "personal-color",
    HAIR_COLOR: "hair-color",
    PERSONAL_BODY_TYPE: "personal-body-type",
    PERSONAL_MAKEUP: "personal-makeup",
    COSMETIC_SURGERY: "cosmetic-surgery",
  } as const;
  
  export type ViewType = keyof typeof VIEWS;
  
  export const VIEW_LIST: { name: string; view: ViewType }[] = [
    { name: "Personal Color", view: VIEWS.PERSONAL_COLOR },
    { name: "Hair Color", view: VIEWS.HAIR_COLOR },
    { name: "Personal Body Type", view: VIEWS.PERSONAL_BODY_TYPE },
    { name: "Personal Makeup", view: VIEWS.PERSONAL_MAKEUP },
    { name: "Cosmetic Surgery", view: VIEWS.COSMETIC_SURGERY },
  ];