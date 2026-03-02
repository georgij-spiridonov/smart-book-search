declare module "nuxt-auth-utils" {
  interface User {
    id: string;
    isAdmin: boolean;
  }
}

declare module "#auth-utils" {
  interface User {
    id: string;
    isAdmin: boolean;
  }
}

export {}
