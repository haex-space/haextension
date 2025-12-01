# Migration Guide: Nuxt UI zu shadcn-vue

## Komponenten-Mapping

### Button
**Nuxt UI:**
```vue
<UButton label="Click me" color="primary" />
```

**shadcn-vue:**
```vue
<Button variant="default">Click me</Button>
```

Eigenschaften-Mapping:
- `color="primary"` → `variant="default"`
- `color="error"` → `variant="destructive"`
- `color="success"` → `variant="default"` (mit custom class)
- `variant="ghost"` → `variant="ghost"`
- `variant="outline"` → `variant="outline"`

### Card
**Nuxt UI:**
```vue
<UCard class="p-4">
  <template #header>Title</template>
  Content
</UCard>
```

**shadcn-vue:**
```vue
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

### Input
**Nuxt UI:**
```vue
<UInput v-model="value" placeholder="Enter text" />
```

**shadcn-vue:**
```vue
<Input v-model="value" placeholder="Enter text" />
```

### Textarea
**Nuxt UI:**
```vue
<UTextarea v-model="value" />
```

**shadcn-vue:**
```vue
<Textarea v-model="value" />
```

### Dropdown Menu
**Nuxt UI:**
```vue
<UDropdownMenu :items="items">
  <UButton label="Options" />
</UDropdownMenu>
```

**shadcn-vue:**
```vue
<DropdownMenu>
  <DropdownMenuTrigger as-child>
    <Button>Options</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item 1</DropdownMenuItem>
    <DropdownMenuItem>Item 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Tooltip
**Nuxt UI:**
```vue
<UTooltip text="Tooltip text">
  <UButton />
</UTooltip>
```

**shadcn-vue:**
```vue
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button />
    </TooltipTrigger>
    <TooltipContent>Tooltip text</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Modal/Dialog
**Nuxt UI:**
```vue
<UModal v-model="isOpen">
  <template #header>Title</template>
  Content
</UModal>
```

**shadcn-vue:**
```vue
<Dialog v-model:open="isOpen">
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    Content
  </DialogContent>
</Dialog>
```

### Drawer
**Nuxt UI:**
```vue
<UDrawer v-model="isOpen">
  Content
</UDrawer>
```

**shadcn-vue:**
```vue
<Drawer v-model:open="isOpen">
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>Title</DrawerTitle>
    </DrawerHeader>
    Content
  </DrawerContent>
</Drawer>
```

### Tabs
**Nuxt UI:**
```vue
<UTabs :items="tabs" />
```

**shadcn-vue:**
```vue
<Tabs v-model="activeTab">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

### Icon
**Nuxt UI:**
```vue
<UIcon name="i-heroicons-check" />
```

**shadcn-vue:**
Verwende `lucide-vue-next`:
```vue
<script setup>
import { Check } from 'lucide-vue-next'
</script>

<Check class="w-4 h-4" />
```

### Checkbox
**Nuxt UI:**
```vue
<UCheckbox v-model="checked" />
```

**shadcn-vue:**
```vue
<Checkbox v-model:checked="checked" />
```

### Slider
**Nuxt UI:**
```vue
<USlider v-model="value" />
```

**shadcn-vue:**
```vue
<Slider v-model="value" />
```

### Progress
**Nuxt UI:**
```vue
<UProgress :value="50" />
```

**shadcn-vue:**
```vue
<Progress :model-value="50" />
```

### Badge
**Nuxt UI:**
```vue
<UBadge color="info">Badge</UBadge>
```

**shadcn-vue:**
```vue
<Badge variant="default">Badge</Badge>
```

## Wichtige Unterschiede

1. **v-model**: Bei vielen shadcn-vue Komponenten wird `v-model:open` statt `v-model` verwendet
2. **Slots**: shadcn-vue verwendet mehr explizite Unter-Komponenten statt Slots
3. **as-child**: Für Trigger-Elemente muss oft `as-child` verwendet werden
4. **Icons**: Nuxt UI Icon wird durch lucide-vue-next ersetzt
5. **TooltipProvider**: Muss als Wrapper für Tooltips verwendet werden
