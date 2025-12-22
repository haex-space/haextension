<template>
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-8">Component Tests</h1>

    <ShadcnTabs default-value="button" class="w-full">
      <ShadcnTabsList class="mb-8">
        <ShadcnTabsTrigger value="button">Button</ShadcnTabsTrigger>
        <ShadcnTabsTrigger value="input">Input</ShadcnTabsTrigger>
        <ShadcnTabsTrigger value="card">Card</ShadcnTabsTrigger>
        <ShadcnTabsTrigger value="dropdown">Dropdown</ShadcnTabsTrigger>
      </ShadcnTabsList>

      <!-- Button Tab -->
      <ShadcnTabsContent value="button" class="space-y-8">
        <h2 class="text-2xl font-bold">Button Component</h2>

        <!-- Variants -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Variants</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton variant="default"> Default </UiButton>
            <UiButton variant="destructive"> Destructive </UiButton>
            <UiButton variant="outline"> Outline </UiButton>
            <UiButton variant="secondary"> Secondary </UiButton>
            <UiButton variant="ghost"> Ghost </UiButton>
            <UiButton variant="link"> Link </UiButton>
          </div>
        </section>

        <!-- Sizes -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Sizes</h3>
          <div class="flex flex-wrap items-center gap-4">
            <UiButton size="sm"> Small </UiButton>
            <UiButton size="default"> Default </UiButton>
            <UiButton size="lg"> Large </UiButton>
          </div>
        </section>

        <!-- With Icons -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">With Icons</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton :icon="Plus"> Add Item </UiButton>
            <UiButton :icon="Trash2" variant="destructive"> Delete </UiButton>
            <UiButton :icon="Download" variant="outline"> Download </UiButton>
            <UiButton :icon="Check" variant="secondary"> Confirm </UiButton>
          </div>
        </section>

        <!-- Prepend & Append Icons -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Prepend & Append Icons</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton :prepend-icon="Plus"> Prepend Icon </UiButton>
            <UiButton :append-icon="Download"> Append Icon </UiButton>
            <UiButton :prepend-icon="Plus" :append-icon="Download">
              Both Icons
            </UiButton>
            <UiButton
              :prepend-icon="Check"
              :append-icon="Trash2"
              variant="destructive"
            >
              Delete with Confirm
            </UiButton>
          </div>
        </section>

        <!-- Icon Only -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Icon Only</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton :icon="Plus" size="icon" tooltip="Add new item" />
            <UiButton
              :icon="Pencil"
              size="icon"
              variant="ghost"
              tooltip="Edit"
            />
            <UiButton
              :icon="Trash2"
              size="icon"
              variant="destructive"
              tooltip="Delete"
            />
            <UiButton
              :icon="MoreVertical"
              size="icon"
              variant="outline"
              tooltip="More options"
            />
          </div>
        </section>

        <!-- Loading State -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Loading State</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton loading> Loading... </UiButton>
            <UiButton loading variant="outline"> Processing </UiButton>
            <UiButton :icon="Download" loading variant="secondary">
              Downloading
            </UiButton>
          </div>
        </section>

        <!-- Disabled State -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Disabled State</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton disabled> Disabled </UiButton>
            <UiButton disabled variant="destructive">
              Disabled Destructive
            </UiButton>
            <UiButton :icon="Plus" disabled> Disabled with Icon </UiButton>
          </div>
        </section>

        <!-- With Tooltips -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">With Tooltips</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton tooltip="This is a helpful tooltip"> Hover me </UiButton>
            <UiButton :icon="Plus" tooltip="Add a new password entry">
              Add Password
            </UiButton>
            <UiButton
              :icon="Database"
              size="icon"
              variant="ghost"
              tooltip="Import from database"
            />
          </div>
        </section>

        <!-- Event Handling -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Event Handling</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton @click="handleClick"> Click Me </UiButton>
            <UiButton :icon="Plus" @click="handleClick">
              Add Item (with click)
            </UiButton>
          </div>
          <p v-if="clickCount > 0" class="text-sm text-muted-foreground">
            Button clicked {{ clickCount }} time(s)
          </p>
        </section>
      </ShadcnTabsContent>

      <!-- Input Tab -->
      <ShadcnTabsContent value="input" class="space-y-8">
        <h2 class="text-2xl font-bold">Input & InputGroup Component</h2>

        <!-- Basic Input -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Basic Input</h3>
          <div class="space-y-4 max-w-md">
            <ShadcnInput v-model="inputValue" placeholder="Type something..." />
            <ShadcnInput type="email" placeholder="Email address" />
            <ShadcnInput type="password" placeholder="Password" />
            <ShadcnInput disabled placeholder="Disabled input" />
          </div>
        </section>

        <!-- InputGroup with Icons -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">InputGroup with Icons</h3>
          <div class="space-y-4 max-w-md">
            <ShadcnInputGroup>
              <ShadcnInputGroupInput placeholder="Search..." />
              <ShadcnInputGroupAddon>
                <Search />
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>

            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                type="email"
                placeholder="Enter your email"
              />
              <ShadcnInputGroupAddon>
                <Mail />
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>

            <ShadcnInputGroup>
              <ShadcnInputGroupInput placeholder="Card number" />
              <ShadcnInputGroupAddon>
                <Copy />
              </ShadcnInputGroupAddon>
              <ShadcnInputGroupAddon align="inline-end">
                <Check />
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>

            <ShadcnInputGroup>
              <ShadcnInputGroupInput placeholder="With multiple icons" />
              <ShadcnInputGroupAddon align="inline-end">
                <Eye />
                <AlertCircle />
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>
          </div>
        </section>

        <!-- InputGroup with Buttons -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">InputGroup with Buttons</h3>
          <div class="space-y-4 max-w-md">
            <ShadcnInputGroup>
              <ShadcnInputGroupInput placeholder="Search with action" />
              <ShadcnInputGroupAddon align="inline-end">
                <ShadcnInputGroupButton size="icon-xs" aria-label="Search">
                  <Search />
                </ShadcnInputGroupButton>
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>

            <ShadcnInputGroup>
              <ShadcnInputGroupInput placeholder="Email with actions" />
              <ShadcnInputGroupAddon align="inline-end">
                <ShadcnInputGroupButton size="icon-xs" tooltip="Copy">
                  <Copy />
                </ShadcnInputGroupButton>
                <ShadcnInputGroupButton size="icon-xs" tooltip="Verify">
                  <Check />
                </ShadcnInputGroupButton>
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>

            <ShadcnInputGroup>
              <ShadcnInputGroupInput
                type="password"
                placeholder="Password with generator"
              />
              <ShadcnInputGroupAddon align="inline-end">
                <ShadcnInputGroupButton size="icon-xs" tooltip="Show password">
                  <Eye />
                </ShadcnInputGroupButton>
                <ShadcnInputGroupButton size="icon-xs" tooltip="Generate">
                  <RefreshCw />
                </ShadcnInputGroupButton>
                <ShadcnInputGroupButton size="icon-xs" tooltip="Copy">
                  <Copy />
                </ShadcnInputGroupButton>
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>

            <ShadcnInputGroup>
              <ShadcnInputGroupInput placeholder="Type to search..." />
              <ShadcnInputGroupAddon align="inline-end">
                <ShadcnInputGroupButton variant="secondary">
                  Search
                </ShadcnInputGroupButton>
              </ShadcnInputGroupAddon>
            </ShadcnInputGroup>
          </div>
        </section>
      </ShadcnTabsContent>

      <!-- Card Tab -->
      <ShadcnTabsContent value="card" class="space-y-8">
        <h2 class="text-2xl font-bold">Card Component</h2>

        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Basic Cards</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ShadcnCard>
              <ShadcnCardHeader>
                <ShadcnCardTitle>Card Title</ShadcnCardTitle>
                <ShadcnCardDescription
                  >Card description goes here</ShadcnCardDescription
                >
              </ShadcnCardHeader>
              <ShadcnCardContent>
                <p>This is the card content area.</p>
              </ShadcnCardContent>
              <ShadcnCardFooter>
                <UiButton variant="outline">Cancel</UiButton>
                <UiButton>Save</UiButton>
              </ShadcnCardFooter>
            </ShadcnCard>

            <ShadcnCard>
              <ShadcnCardHeader>
                <ShadcnCardTitle>Another Card</ShadcnCardTitle>
              </ShadcnCardHeader>
              <ShadcnCardContent>
                <p>Card with minimal content.</p>
              </ShadcnCardContent>
            </ShadcnCard>
          </div>
        </section>
      </ShadcnTabsContent>

      <!-- Dropdown Tab -->
      <ShadcnTabsContent value="dropdown" class="space-y-8">
        <h2 class="text-2xl font-bold">Dropdown Menu Component</h2>

        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Basic Dropdown</h3>
          <div class="flex flex-wrap gap-4">
            <ShadcnDropdownMenu>
              <ShadcnDropdownMenuTrigger as-child>
                <UiButton variant="outline">Open Menu</UiButton>
              </ShadcnDropdownMenuTrigger>
              <ShadcnDropdownMenuContent>
                <ShadcnDropdownMenuLabel>My Account</ShadcnDropdownMenuLabel>
                <ShadcnDropdownMenuSeparator />
                <ShadcnDropdownMenuItem>Profile</ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem>Settings</ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem>Logout</ShadcnDropdownMenuItem>
              </ShadcnDropdownMenuContent>
            </ShadcnDropdownMenu>

            <ShadcnDropdownMenu>
              <ShadcnDropdownMenuTrigger as-child>
                <UiButton :icon="MoreVertical" size="icon" variant="ghost" />
              </ShadcnDropdownMenuTrigger>
              <ShadcnDropdownMenuContent>
                <ShadcnDropdownMenuItem>Edit</ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuItem>Duplicate</ShadcnDropdownMenuItem>
                <ShadcnDropdownMenuSeparator />
                <ShadcnDropdownMenuItem class="text-error"
                  >Delete</ShadcnDropdownMenuItem
                >
              </ShadcnDropdownMenuContent>
            </ShadcnDropdownMenu>
          </div>
        </section>
      </ShadcnTabsContent>
    </ShadcnTabs>
  </div>
</template>

<script setup lang="ts">
import {
  Plus,
  Trash2,
  Download,
  Check,
  Pencil,
  MoreVertical,
  Search,
  Database,
  Mail,
  AlertCircle,
  Copy,
  Eye,
  RefreshCw,
} from "lucide-vue-next";

definePageMeta({
  name: "componentOverview",
});

const clickCount = ref(0);
const inputValue = ref("");

const handleClick = () => {
  clickCount.value++;
};
</script>
