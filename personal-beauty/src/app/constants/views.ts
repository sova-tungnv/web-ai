// src/constants/views.ts
export const VIEWS = {
    HOME: "HOME",
    PERSONAL_COLOR: "PERSONAL_COLOR",
    PERSONAL_MAKEUP: "PERSONAL_MAKEUP",
    COSMETIC_SURGERY: "COSMETIC_SURGERY",
    HAIR_COLOR: "HAIR_COLOR",
    PERSONAL_BODY_TYPE: "PERSONAL_BODY_TYPE",
  } as const;
  
  export type ViewType = keyof typeof VIEWS;
  
  export const VIEW_LIST: { name: string; view: ViewType }[] = [
    { name: "Personal Color", view: VIEWS.PERSONAL_COLOR },
    { name: "Personal Makeup", view: VIEWS.PERSONAL_MAKEUP },
    { name: "Cosmetic Surgery", view: VIEWS.COSMETIC_SURGERY },
    { name: "Hair Color", view: VIEWS.HAIR_COLOR },
    { name: "Personal Body Type", view: VIEWS.PERSONAL_BODY_TYPE },
  ];