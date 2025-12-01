<template>
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-8">Component Tests</h1>

    <UiTabs default-value="button" class="w-full">
      <UiTabsList class="mb-8">
        <UiTabsTrigger value="button">Button</UiTabsTrigger>
        <UiTabsTrigger value="input">Input</UiTabsTrigger>
        <UiTabsTrigger value="card">Card</UiTabsTrigger>
        <UiTabsTrigger value="dropdown">Dropdown</UiTabsTrigger>
      </UiTabsList>

      <!-- Button Tab -->
      <UiTabsContent value="button" class="space-y-8">
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
            <UiButton :prepend-icon="Check" :append-icon="Trash2" variant="destructive">
              Delete with Confirm
            </UiButton>
          </div>
        </section>

        <!-- Icon Only -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Icon Only</h3>
          <div class="flex flex-wrap gap-4">
            <UiButton :icon="Plus" size="icon" tooltip="Add new item" />
            <UiButton :icon="Pencil" size="icon" variant="ghost" tooltip="Edit" />
            <UiButton :icon="Trash2" size="icon" variant="destructive" tooltip="Delete" />
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
            <UiButton disabled variant="destructive"> Disabled Destructive </UiButton>
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
      </UiTabsContent>

      <!-- Input Tab -->
      <UiTabsContent value="input" class="space-y-8">
        <h2 class="text-2xl font-bold">Input & InputGroup Component</h2>

        <!-- Basic Input -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Basic Input</h3>
          <div class="space-y-4 max-w-md">
            <UiInput v-model="inputValue" placeholder="Type something..." />
            <UiInput type="email" placeholder="Email address" />
            <UiInput type="password" placeholder="Password" />
            <UiInput disabled placeholder="Disabled input" />
          </div>
        </section>

        <!-- InputGroup with Icons -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">InputGroup with Icons</h3>
          <div class="space-y-4 max-w-md">
            <UiInputGroup>
              <UiInputGroupInput placeholder="Search..." />
              <UiInputGroupAddon>
                <Search />
              </UiInputGroupAddon>
            </UiInputGroup>

            <UiInputGroup>
              <UiInputGroupInput type="email" placeholder="Enter your email" />
              <UiInputGroupAddon>
                <Mail />
              </UiInputGroupAddon>
            </UiInputGroup>

            <UiInputGroup>
              <UiInputGroupInput placeholder="Card number" />
              <UiInputGroupAddon>
                <Copy />
              </UiInputGroupAddon>
              <UiInputGroupAddon align="inline-end">
                <Check />
              </UiInputGroupAddon>
            </UiInputGroup>

            <UiInputGroup>
              <UiInputGroupInput placeholder="With multiple icons" />
              <UiInputGroupAddon align="inline-end">
                <Eye />
                <AlertCircle />
              </UiInputGroupAddon>
            </UiInputGroup>
          </div>
        </section>

        <!-- InputGroup with Buttons -->
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">InputGroup with Buttons</h3>
          <div class="space-y-4 max-w-md">
            <UiInputGroup>
              <UiInputGroupInput placeholder="Search with action" />
              <UiInputGroupAddon align="inline-end">
                <UiInputGroupButton size="icon-xs" aria-label="Search">
                  <Search />
                </UiInputGroupButton>
              </UiInputGroupAddon>
            </UiInputGroup>

            <UiInputGroup>
              <UiInputGroupInput placeholder="Email with actions" />
              <UiInputGroupAddon align="inline-end">
                <UiInputGroupButton size="icon-xs" tooltip="Copy">
                  <Copy />
                </UiInputGroupButton>
                <UiInputGroupButton size="icon-xs" tooltip="Verify">
                  <Check />
                </UiInputGroupButton>
              </UiInputGroupAddon>
            </UiInputGroup>

            <UiInputGroup>
              <UiInputGroupInput type="password" placeholder="Password with generator" />
              <UiInputGroupAddon align="inline-end">
                <UiInputGroupButton size="icon-xs" tooltip="Show password">
                  <Eye />
                </UiInputGroupButton>
                <UiInputGroupButton size="icon-xs" tooltip="Generate">
                  <RefreshCw />
                </UiInputGroupButton>
                <UiInputGroupButton size="icon-xs" tooltip="Copy">
                  <Copy />
                </UiInputGroupButton>
              </UiInputGroupAddon>
            </UiInputGroup>

            <UiInputGroup>
              <UiInputGroupInput placeholder="Type to search..." />
              <UiInputGroupAddon align="inline-end">
                <UiInputGroupButton variant="secondary">
                  Search
                </UiInputGroupButton>
              </UiInputGroupAddon>
            </UiInputGroup>
          </div>
        </section>
      </UiTabsContent>

      <!-- Card Tab -->
      <UiTabsContent value="card" class="space-y-8">
        <h2 class="text-2xl font-bold">Card Component</h2>

        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Basic Cards</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UiCard>
              <UiCardHeader>
                <UiCardTitle>Card Title</UiCardTitle>
                <UiCardDescription>Card description goes here</UiCardDescription>
              </UiCardHeader>
              <UiCardContent>
                <p>This is the card content area.</p>
              </UiCardContent>
              <UiCardFooter>
                <UiButton variant="outline">Cancel</UiButton>
                <UiButton>Save</UiButton>
              </UiCardFooter>
            </UiCard>

            <UiCard>
              <UiCardHeader>
                <UiCardTitle>Another Card</UiCardTitle>
              </UiCardHeader>
              <UiCardContent>
                <p>Card with minimal content.</p>
              </UiCardContent>
            </UiCard>
          </div>
        </section>
      </UiTabsContent>

      <!-- Dropdown Tab -->
      <UiTabsContent value="dropdown" class="space-y-8">
        <h2 class="text-2xl font-bold">Dropdown Menu Component</h2>

        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Basic Dropdown</h3>
          <div class="flex flex-wrap gap-4">
            <UiDropdownMenu>
              <UiDropdownMenuTrigger as-child>
                <UiButton variant="outline">Open Menu</UiButton>
              </UiDropdownMenuTrigger>
              <UiDropdownMenuContent>
                <UiDropdownMenuLabel>My Account</UiDropdownMenuLabel>
                <UiDropdownMenuSeparator />
                <UiDropdownMenuItem>Profile</UiDropdownMenuItem>
                <UiDropdownMenuItem>Settings</UiDropdownMenuItem>
                <UiDropdownMenuItem>Logout</UiDropdownMenuItem>
              </UiDropdownMenuContent>
            </UiDropdownMenu>

            <UiDropdownMenu>
              <UiDropdownMenuTrigger as-child>
                <UiButton :icon="MoreVertical" size="icon" variant="ghost" />
              </UiDropdownMenuTrigger>
              <UiDropdownMenuContent>
                <UiDropdownMenuItem>Edit</UiDropdownMenuItem>
                <UiDropdownMenuItem>Duplicate</UiDropdownMenuItem>
                <UiDropdownMenuSeparator />
                <UiDropdownMenuItem class="text-error">Delete</UiDropdownMenuItem>
              </UiDropdownMenuContent>
            </UiDropdownMenu>
          </div>
        </section>
      </UiTabsContent>
    </UiTabs>
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
